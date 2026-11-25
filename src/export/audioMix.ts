/**
 * The export's audio mix (pure; no Mediabunny): music plus the clips whose own sound is kept, at
 * one sample rate, in story time. Sources are abstract PCM readers so this is unit-testable; the
 * worker feeds them from decoded files (audioSources.ts).
 */

export type Stereo = [Float32Array, Float32Array];

/** Sequential stereo PCM at the mix rate; reads past the end return silence. */
export interface PcmReader {
  read(frames: number): Promise<Stereo>;
}

export interface MixPlan {
  /** Output sample rate (frames per second). */
  rate: number;
  /** Length of the audio in story ms (the mix ends when the last source does). */
  endMs: number;
  /** Music: heard from story 0 to `endMs`, with a per-time gain (volume × fades × duck). */
  music?: { reader: PcmReader; endMs: number; gain: (storyMs: number) => number };
  /** Clips with sound: each heard from `startMs` to `endMs` (its reader starts at clip time 0). */
  clips: { reader: PcmReader; startMs: number; endMs: number }[];
}

/** Short fade at clip edges so sound starting or stopping mid-wave doesn't click. */
export const CLIP_EDGE_FADE_MS = 15;
export const MIX_BLOCK_FRAMES = 4096;

/** Gain of a clip at `t` within [startMs, endMs): 1, ramped over CLIP_EDGE_FADE_MS at both edges. */
export function clipEdgeGain(t: number, startMs: number, endMs: number): number {
  if (t < startMs || t >= endMs) return 0;
  return Math.min(1, (t - startMs) / CLIP_EDGE_FADE_MS, (endMs - t) / CLIP_EDGE_FADE_MS);
}

/** Mixed blocks of `MIX_BLOCK_FRAMES`, from story time 0 to `plan.endMs`. */
export async function* mixAudio(plan: MixPlan, blockFrames = MIX_BLOCK_FRAMES): AsyncGenerator<{ planes: Stereo; startS: number }> {
  const { rate } = plan;
  const toFrame = (ms: number) => Math.round((ms * rate) / 1000);
  const total = toFrame(plan.endMs);
  const musicEnd = plan.music ? Math.min(total, toFrame(plan.music.endMs)) : 0;
  const clips = plan.clips.map((clip) => ({ ...clip, startFrame: toFrame(clip.startMs), endFrame: Math.min(total, toFrame(clip.endMs)) }));

  for (let start = 0; start < total; start += blockFrames) {
    const frames = Math.min(blockFrames, total - start);
    const out: Stereo = [new Float32Array(frames), new Float32Array(frames)];

    if (plan.music && start < musicEnd) {
      const count = Math.min(frames, musicEnd - start);
      const [left, right] = await plan.music.reader.read(count);
      for (let i = 0; i < count; i += 1) {
        const gain = plan.music.gain(((start + i) * 1000) / rate);
        out[0][i]! += left[i]! * gain;
        out[1][i]! += right[i]! * gain;
      }
    }

    for (const clip of clips) {
      const from = Math.max(start, clip.startFrame);
      const to = Math.min(start + frames, clip.endFrame);
      if (from >= to) continue;
      const [left, right] = await clip.reader.read(to - from);
      for (let f = from; f < to; f += 1) {
        const gain = clipEdgeGain((f * 1000) / rate, clip.startMs, clip.endMs);
        out[0][f - start]! += left[f - from]! * gain;
        out[1][f - start]! += right[f - from]! * gain;
      }
    }

    yield { planes: out, startS: start / rate };
  }
}

/**
 * Linear-interpolation resampler to stereo at `outRate`. Push decoded blocks (any channel count,
 * any rate; mono is duplicated, extra channels dropped), pull exact frame counts.
 */
export class Resampler {
  private left: Float32Array = new Float32Array(0);
  private right: Float32Array = new Float32Array(0);
  /** Read position in the buffered input, in input frames (fractional). */
  private position = 0;
  private inRate = 0;
  private finished = false;

  constructor(private readonly outRate: number) {}

  push(planes: Float32Array[], rate: number): void {
    if (planes.length === 0) return;
    this.inRate = rate;
    const l = planes[0]!;
    const r = planes[1] ?? l;
    this.left = concat(this.left, l);
    this.right = concat(this.right, r);
  }

  /** No more input: further pulls are padded with silence. */
  finish(): void {
    this.finished = true;
  }

  /** Output frames available without more input. */
  available(): number {
    if (this.inRate === 0) return 0;
    const step = this.inRate / this.outRate;
    // Interpolation at position p needs input frames floor(p) and floor(p) + 1.
    return Math.max(0, Math.floor((this.left.length - 1 - this.position) / step) + 1);
  }

  /** `frames` output frames, or null if more input is needed (unless finished: then padded). */
  pull(frames: number): Stereo | null {
    if (!this.finished && this.available() < frames) return null;
    const step = this.inRate === 0 ? 1 : this.inRate / this.outRate;
    const out: Stereo = [new Float32Array(frames), new Float32Array(frames)];
    for (let i = 0; i < frames; i += 1) {
      const x0 = Math.floor(this.position);
      const frac = this.position - x0;
      if (x0 + 1 < this.left.length) {
        out[0][i] = this.left[x0]! + (this.left[x0 + 1]! - this.left[x0]!) * frac;
        out[1][i] = this.right[x0]! + (this.right[x0 + 1]! - this.right[x0]!) * frac;
      } else if (x0 < this.left.length) {
        out[0][i] = this.left[x0]!;
        out[1][i] = this.right[x0]!;
      }
      this.position += step;
    }
    // Drop consumed input.
    const drop = Math.min(Math.floor(this.position), this.left.length);
    if (drop > 0) {
      this.left = this.left.slice(drop);
      this.right = this.right.slice(drop);
      this.position -= drop;
    }
    return out;
  }
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  if (a.length === 0) return b.slice();
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

import { ALL_FORMATS, AudioSample, AudioSampleSink, BlobSource, canEncodeAudio, Input, Quality, type AudioCodec } from 'mediabunny';
import { duckGain, musicEndMs, musicGain, type SoundSegment } from '../domain/music';
import type { AudioTrack } from '../domain/project';
import { mixAudio, Resampler, type MixPlan, type PcmReader, type Stereo } from './audioMix';
import type { ExportContainer } from './target';

/** Encoded audio: 48 kHz stereo (accepted by both AAC and Opus), 160 kbps. */
export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;
export const AUDIO_BITRATE = 160_000;

export function audioCodecFor(container: ExportContainer): AudioCodec {
  return container === 'mp4' ? 'aac' : 'opus';
}

export async function canEncodeAudioCodec(codec: AudioCodec): Promise<boolean> {
  return canEncodeAudio(codec, { sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: AUDIO_CHANNELS, quality: new Quality({ bitrate: AUDIO_BITRATE }) });
}

/**
 * Decoded audio of a file as a sequential stereo reader at the mix rate, starting at `startS`
 * seconds into the file (earlier frames of the first block are dropped).
 */
class DecodedReader implements PcmReader {
  private readonly resampler = new Resampler(AUDIO_SAMPLE_RATE);
  private readonly samples: AsyncIterator<AudioSample>;

  constructor(
    sink: AudioSampleSink,
    private readonly startS: number,
  ) {
    this.samples = sink.samples(startS)[Symbol.asyncIterator]();
  }

  async read(frames: number): Promise<Stereo> {
    for (;;) {
      const ready = this.resampler.pull(frames);
      if (ready) return ready;
      const next = await this.samples.next();
      if (next.done) {
        this.resampler.finish();
        continue;
      }
      const sample = next.value;
      try {
        const planes: Float32Array[] = [];
        for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
          const options = { planeIndex: channel, format: 'f32-planar' as const };
          const plane = new Float32Array(sample.allocationSize(options) / Float32Array.BYTES_PER_ELEMENT);
          sample.copyTo(plane, options);
          planes.push(plane);
        }
        // Trim what lies before the start point.
        const skip = Math.max(0, Math.round((this.startS - sample.timestamp) * sample.sampleRate));
        this.resampler.push(skip > 0 ? planes.map((p) => p.subarray(skip)) : planes, sample.sampleRate);
      } finally {
        sample.close();
      }
    }
  }
}

async function openAudio(file: Blob): Promise<{ input: Input; sink: AudioSampleSink; durationMs: number } | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack().catch(() => null);
  if (!track) {
    input.dispose();
    return null;
  }
  if (!(await track.canDecode())) {
    input.dispose();
    throw new Error(`This browser can't decode ${track.codec ?? 'this'} audio.`);
  }
  return { input, sink: new AudioSampleSink(track), durationMs: (await track.computeDuration()) * 1000 };
}

export interface AudioMixInput {
  storyMs: number;
  music?: { file: Blob; track: AudioTrack };
  /** Clips with "Keep clip sound", from `soundSegments` (already limited to the story). */
  clips: { file: Blob; segment: SoundSegment }[];
}

export interface OpenedMix {
  /** Mixed blocks as encoder-ready samples; null when there's nothing to hear. */
  samples: AsyncIterable<AudioSample> | null;
  /** Whether the story's music is part of the mix. */
  musicIncluded: boolean;
  /** Why the music was left out, if it was. */
  musicNote?: string;
  dispose(): void;
}

/** Decode the music and the audible clips and set up the mix. Clips without sound are skipped. */
export async function openAudioMix(input: AudioMixInput): Promise<OpenedMix> {
  const opened: Input[] = [];
  const dispose = () => opened.forEach((i) => i.dispose());
  let musicNote: string | undefined;
  const plan: MixPlan = { rate: AUDIO_SAMPLE_RATE, endMs: 0, clips: [] };
  const segments = input.clips.map((c) => c.segment);

  if (input.music) {
    try {
      const audio = await openAudio(input.music.file);
      if (!audio) throw new Error('the file has no audio track');
      opened.push(audio.input);
      const { track } = input.music;
      const endMs = musicEndMs(track, input.storyMs, audio.durationMs);
      if (endMs <= 0) {
        musicNote = 'The song’s start point is past its end, so the video has no music.';
      } else {
        const songMs = audio.durationMs;
        plan.music = {
          reader: new DecodedReader(audio.sink, track.offsetMs / 1000),
          endMs,
          gain: (t) => musicGain(track, t, input.storyMs, songMs) * duckGain(t, segments),
        };
        plan.endMs = Math.max(plan.endMs, endMs);
      }
    } catch (error) {
      musicNote = `The music couldn’t be read (${error instanceof Error ? error.message : String(error)}), so the video has no music.`;
    }
  }

  for (const { file, segment } of input.clips) {
    try {
      const audio = await openAudio(file);
      if (!audio) continue; // a clip without a sound track: silent, as expected
      opened.push(audio.input);
      const endMs = Math.min(segment.endMs, segment.startMs + audio.durationMs, input.storyMs);
      if (endMs <= segment.startMs) continue;
      plan.clips.push({ reader: new DecodedReader(audio.sink, 0), startMs: segment.startMs, endMs });
      plan.endMs = Math.max(plan.endMs, endMs);
    } catch {
      // An undecodable clip track stays silent; the picture is unaffected.
    }
  }

  if (plan.endMs <= 0) {
    dispose();
    return { samples: null, musicIncluded: false, musicNote, dispose: () => undefined };
  }

  async function* samples(): AsyncGenerator<AudioSample> {
    for await (const block of mixAudio(plan)) {
      const frames = block.planes[0].length;
      const data = new Float32Array(frames * 2);
      data.set(block.planes[0], 0);
      data.set(block.planes[1], frames);
      yield new AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: AUDIO_SAMPLE_RATE, timestamp: block.startS });
    }
  }

  return { samples: samples(), musicIncluded: plan.music !== undefined, musicNote, dispose };
}

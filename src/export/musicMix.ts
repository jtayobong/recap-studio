import { musicEndMs, musicGain } from '../domain/music';
import type { AudioTrack } from '../domain/project';

/**
 * The export's music mix, one decoded block of the song at a time (pure, no Mediabunny):
 * keep only the frames inside the music's span, apply the same gain envelope the preview uses
 * (volume × fade in × fade out, from `domain/music.ts`) and move the block to story time.
 */

export interface PcmBlock {
  /** One Float32Array per channel, all the same length. */
  planes: Float32Array[];
  sampleRate: number;
  /** Where this block starts, in seconds: song time on input, story time on output. */
  startS: number;
}

export interface MixContext {
  track: Pick<AudioTrack, 'offsetMs' | 'volume' | 'fadeIn' | 'fadeOut'>;
  storyMs: number;
  songMs: number;
}

/** The part of `block` (in song time) heard in the story, with gain applied; null if none of it is. */
export function mixMusicBlock(block: PcmBlock, context: MixContext): PcmBlock | null {
  const { track, storyMs, songMs } = context;
  const endMs = musicEndMs(track, storyMs, songMs);
  const frames = block.planes[0]?.length ?? 0;
  if (frames === 0 || endMs <= 0) return null;

  // Story time (ms) of frame i: song time minus the start point.
  const storyMsAt = (i: number) => (block.startS + i / block.sampleRate) * 1000 - track.offsetMs;
  let first = 0;
  while (first < frames && storyMsAt(first) < 0) first += 1;
  let last = frames; // exclusive
  while (last > first && storyMsAt(last - 1) >= endMs) last -= 1;
  if (first >= last) return null;

  const planes = block.planes.map((plane) => plane.slice(first, last));
  for (let i = 0; i < last - first; i += 1) {
    const gain = musicGain(track, storyMsAt(first + i), storyMs, songMs);
    for (const plane of planes) plane[i]! *= gain;
  }
  return { planes, sampleRate: block.sampleRate, startS: storyMsAt(first) / 1000 };
}

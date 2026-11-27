import { MUSIC_FADE_IN_MS, MUSIC_FADE_OUT_MS, type AudioTrack, type Scene } from './project';

/**
 * How the story's music plays, as pure functions of story time. The preview (an <audio> element)
 * and the export (mixed samples) both use these, so they start, stop and fade identically.
 *
 * Rules (M6 decisions, D26): the music starts at `startMs` in the story (the story start, or the
 * start of the scene picked in M12.4, see `musicStartMs`) at `offsetMs` into the song and plays
 * once; it stops when the song or the story ends, whichever is first. Fade in ramps up over the
 * first MUSIC_FADE_IN_MS after the music starts; fade out ramps down over the last
 * MUSIC_FADE_OUT_MS before it stops.
 */

/**
 * Story time (ms) at which the music starts: the start of the scene `track.startSceneId`, or 0
 * when it isn't set or that scene no longer exists.
 */
export function musicStartMs(track: Pick<AudioTrack, 'startSceneId'>, scenes: readonly Pick<Scene, 'id' | 'durationMs'>[]): number {
  if (!track.startSceneId) return 0;
  let cursor = 0;
  for (const scene of scenes) {
    if (scene.id === track.startSceneId) return cursor;
    cursor += scene.durationMs;
  }
  return 0;
}

/** Position in the song (ms) heard at `storyTimeMs` (music starting at story time `startMs`). */
export function songTimeMs(track: Pick<AudioTrack, 'offsetMs'>, storyTimeMs: number, startMs = 0): number {
  return track.offsetMs + storyTimeMs - startMs;
}

/**
 * Story time (ms) at which the music stops. Equal to `startMs` (no music) if the song's start
 * point is at or past its end, or the music would start after the story ends.
 */
export function musicEndMs(track: Pick<AudioTrack, 'offsetMs'>, storyMs: number, songMs: number, startMs = 0): number {
  return Math.max(startMs, Math.min(storyMs, startMs + songMs - track.offsetMs));
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Linear gain (0–1) at story time `storyTimeMs`: volume × fade in × fade out (0 outside the music). */
export function musicGain(
  track: Pick<AudioTrack, 'offsetMs' | 'volume' | 'fadeIn' | 'fadeOut'>,
  storyTimeMs: number,
  storyMs: number,
  songMs: number,
  startMs = 0,
): number {
  const endMs = musicEndMs(track, storyMs, songMs, startMs);
  if (storyTimeMs < startMs || storyTimeMs >= endMs) return 0;
  let gain = track.volume;
  if (track.fadeIn) gain *= clamp01((storyTimeMs - startMs) / MUSIC_FADE_IN_MS);
  if (track.fadeOut) gain *= clamp01((endMs - storyTimeMs) / MUSIC_FADE_OUT_MS);
  return gain;
}

/** A video clip heard with its own sound, in story time (see render/clipSound.ts). */
export interface SoundSegment {
  assetId: string;
  startMs: number;
  endMs: number;
  /** Music level (0–1) while this clip is heard: the scene's "Music under the clip" (M10). */
  duckLevel: number;
  /** The clip's own volume (0–1): the scene's "Clip volume" (M10). */
  volume: number;
}

/**
 * How loud the music is while a clip's own sound plays, by default (M8: auto-duck to ~30 %). Since
 * M10 each scene can set its own level (`SoundSegment.duckLevel`); this is that field's default.
 */
export const DUCK_LEVEL = 0.3;
/** The music ramps down before a clip with sound starts, and back up after it ends. */
export const DUCK_RAMP_MS = 300;

/**
 * Music multiplier (0–1) at story time `t`: down to each segment's `duckLevel` while its clip is
 * heard, ramped at the edges; where segments overlap, the lowest level wins.
 */
export function duckGain(t: number, segments: readonly SoundSegment[]): number {
  let gain = 1;
  for (const { startMs, endMs, duckLevel } of segments) {
    let coverage = 0; // 1 = fully ducked
    if (t >= startMs && t < endMs) coverage = 1;
    else if (t >= startMs - DUCK_RAMP_MS && t < startMs) coverage = (t - (startMs - DUCK_RAMP_MS)) / DUCK_RAMP_MS;
    else if (t >= endMs && t < endMs + DUCK_RAMP_MS) coverage = 1 - (t - endMs) / DUCK_RAMP_MS;
    gain = Math.min(gain, 1 - (1 - duckLevel) * coverage);
  }
  return gain;
}

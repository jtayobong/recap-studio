import { MUSIC_FADE_IN_MS, MUSIC_FADE_OUT_MS, type AudioTrack } from './project';

/**
 * How the story's music plays, as pure functions of story time. The preview (an <audio> element)
 * and the export (mixed samples) both use these, so they start, stop and fade identically.
 *
 * Rules (M6 decisions, D26): the music starts with the story at `offsetMs` into the song and plays
 * once; it stops when the song or the story ends, whichever is first. Fade in ramps up over the
 * first MUSIC_FADE_IN_MS of the story; fade out ramps down over the last MUSIC_FADE_OUT_MS before
 * the music stops.
 */

/** Position in the song (ms) heard at `storyTimeMs`. */
export function songTimeMs(track: Pick<AudioTrack, 'offsetMs'>, storyTimeMs: number): number {
  return track.offsetMs + storyTimeMs;
}

/** Story time (ms) at which the music stops. 0 if the start point is at or past the song's end. */
export function musicEndMs(track: Pick<AudioTrack, 'offsetMs'>, storyMs: number, songMs: number): number {
  return Math.max(0, Math.min(storyMs, songMs - track.offsetMs));
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Linear gain (0–1) at story time `storyTimeMs`: volume × fade in × fade out. */
export function musicGain(
  track: Pick<AudioTrack, 'offsetMs' | 'volume' | 'fadeIn' | 'fadeOut'>,
  storyTimeMs: number,
  storyMs: number,
  songMs: number,
): number {
  const endMs = musicEndMs(track, storyMs, songMs);
  if (storyTimeMs < 0 || storyTimeMs >= endMs) return 0;
  let gain = track.volume;
  if (track.fadeIn) gain *= clamp01(storyTimeMs / MUSIC_FADE_IN_MS);
  if (track.fadeOut) gain *= clamp01((endMs - storyTimeMs) / MUSIC_FADE_OUT_MS);
  return gain;
}

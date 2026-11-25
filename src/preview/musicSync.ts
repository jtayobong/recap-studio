import { musicEndMs, musicGain, songTimeMs } from '../domain/music';
import type { AudioTrack } from '../domain/project';

/** The parts of HTMLAudioElement the sync uses (a fake in unit tests). */
export interface AudioLike {
  currentTime: number;
  readonly paused: boolean;
  volume: number;
  muted: boolean;
  play(): Promise<void>;
  pause(): void;
}

export interface MusicSyncState {
  track: AudioTrack | undefined;
  /** Song length (ms) once the file is loaded; undefined while loading or missing. */
  songMs: number | undefined;
  storyMs: number;
  timeMs: number;
  playing: boolean;
  muted: boolean;
}

/** Allowed difference between the song position and the playhead while playing. */
export const MUSIC_DRIFT_S = 0.2;
/** When (re)starting, seek only if the element is further off than this. */
const START_TOLERANCE_S = 0.05;

/**
 * Steer the preview's audio element to match playback: silent and paused unless the preview is
 * playing within the music's span; when starting, jump to the right place in the song; while
 * playing, leave it alone unless it drifts; volume follows the fade envelope every frame.
 */
export function syncMusic(audio: AudioLike, state: MusicSyncState): void {
  audio.muted = state.muted;
  const { track, songMs } = state;
  const endMs = track && songMs !== undefined ? musicEndMs(track, state.storyMs, songMs) : 0;
  const active = track !== undefined && songMs !== undefined && state.playing && state.timeMs < endMs;
  if (!active) {
    if (!audio.paused) audio.pause();
    return;
  }

  const target = songTimeMs(track, state.timeMs) / 1000;
  audio.volume = musicGain(track, state.timeMs, state.storyMs, songMs);
  if (audio.paused) {
    if (Math.abs(audio.currentTime - target) > START_TOLERANCE_S) audio.currentTime = target;
    // Rejections (autoplay policy, element torn down) leave the preview silent, not broken.
    void audio.play().catch(() => undefined);
  } else if (Math.abs(audio.currentTime - target) > MUSIC_DRIFT_S) {
    audio.currentTime = target;
  }
}

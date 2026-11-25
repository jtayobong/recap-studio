import { create } from 'zustand';

/**
 * Preview playback state. Kept separate from the project store: playback changes 60 times
 * a second and must never trigger autosave or be persisted.
 */
export interface PlaybackState {
  timeMs: number;
  playing: boolean;
  loop: boolean;
  /** Preview music muted (UI-only; the export always includes the music). */
  muted: boolean;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  setLoop(loop: boolean): void;
  toggleMuted(): void;
  reset(): void;
}

export const usePlaybackStore = create<PlaybackState>()((set) => ({
  timeMs: 0,
  playing: false,
  loop: false,
  muted: false,
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  seek: (timeMs) => set({ timeMs: Math.max(0, timeMs) }),
  setLoop: (loop) => set({ loop }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
  reset: () => set({ timeMs: 0, playing: false }),
}));

/** Advance time by `elapsedMs`, handling the end of the story. Pure, so it is easy to test. */
export function advance(
  timeMs: number,
  elapsedMs: number,
  durationMs: number,
  loop: boolean,
): { timeMs: number; playing: boolean } {
  if (durationMs <= 0) return { timeMs: 0, playing: false };
  const next = timeMs + elapsedMs;
  if (next < durationMs) return { timeMs: next, playing: true };
  return loop ? { timeMs: next % durationMs, playing: true } : { timeMs: durationMs, playing: false };
}

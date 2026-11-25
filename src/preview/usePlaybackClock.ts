import { useEffect } from 'react';
import { advance, usePlaybackStore } from './playbackStore';

/**
 * Drives preview time with requestAnimationFrame while playing.
 * Uses real elapsed time, so playback speed is correct even if frames are dropped.
 */
export function usePlaybackClock(durationMs: number): void {
  const playing = usePlaybackStore((s) => s.playing);

  // Keep the playhead inside the story when scenes are removed or shortened.
  useEffect(() => {
    const { timeMs, seek } = usePlaybackStore.getState();
    if (timeMs > durationMs) seek(durationMs);
  }, [durationMs]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      const { timeMs, loop } = usePlaybackStore.getState();
      const next = advance(timeMs, elapsed, durationMs, loop);
      usePlaybackStore.setState(next);
      if (next.playing) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, durationMs]);
}

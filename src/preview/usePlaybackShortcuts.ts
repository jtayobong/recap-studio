import { useEffect } from 'react';
import { isDialogOpen, isTypingTarget } from '../lib/keyboard';
import { frameToMs } from '../render/timeline';
import { usePlaybackStore } from './playbackStore';
import { togglePlayback } from './PlaybackControls';

/**
 * Space: play/pause · ←/→: one frame (Shift: one second) · Home/End: start/end · M: mute music.
 * Ignored while typing in a field or when a dialog is open.
 */
export function usePlaybackShortcuts(durationMs: number, fps: number): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || isDialogOpen()) return;

      const { timeMs, seek, pause } = usePlaybackStore.getState();
      const step = event.shiftKey ? 1000 : frameToMs(1, fps);

      switch (event.key) {
        case ' ':
          // Let a focused button handle Space itself, to avoid toggling twice.
          if (event.target instanceof HTMLButtonElement) return;
          togglePlayback(durationMs);
          break;
        case 'ArrowLeft':
          pause();
          seek(Math.max(0, timeMs - step));
          break;
        case 'ArrowRight':
          pause();
          seek(Math.min(durationMs, timeMs + step));
          break;
        case 'Home':
          seek(0);
          break;
        case 'End':
          pause();
          seek(durationMs);
          break;
        case 'm':
        case 'M':
          usePlaybackStore.getState().toggleMuted();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [durationMs, fps]);
}

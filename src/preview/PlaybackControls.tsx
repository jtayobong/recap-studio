import { formatTimecode } from '../render/timeline';
import { usePlaybackStore } from './playbackStore';

interface PlaybackControlsProps {
  durationMs: number;
  fps: number;
  /** Show the mute button (only stories with music or clip sound have something to mute). */
  hasSound?: boolean;
}

export function PlaybackControls({ durationMs, fps, hasSound = false }: PlaybackControlsProps) {
  const timeMs = usePlaybackStore((s) => s.timeMs);
  const playing = usePlaybackStore((s) => s.playing);
  const loop = usePlaybackStore((s) => s.loop);
  const muted = usePlaybackStore((s) => s.muted);
  const { pause, seek, setLoop, toggleMuted } = usePlaybackStore.getState();
  const empty = durationMs <= 0;

  return (
    <div className="playback">
      <button
        type="button"
        className="button button--icon"
        onClick={() => seek(0)}
        aria-label="Go to start"
        title="Go to start (Home)"
        disabled={empty}
      >
        ⏮
      </button>
      <button
        type="button"
        className="button button--primary button--icon"
        onClick={() => togglePlayback(durationMs)}
        aria-label={playing ? 'Pause' : 'Play'}
        title="Play / pause (Space)"
        disabled={empty}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <input
        type="range"
        className="playback__scrubber"
        aria-label="Playhead"
        min={0}
        max={Math.max(durationMs, 1)}
        step={1000 / fps}
        value={Math.min(timeMs, durationMs)}
        onPointerDown={pause}
        onChange={(event) => seek(Number(event.target.value))}
        disabled={empty}
      />

      <span className="playback__time" aria-live="off">
        <span data-testid="playhead-time">{formatTimecode(timeMs)}</span> / {formatTimecode(durationMs)}
      </span>

      <label className="playback__loop">
        <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
        Loop
      </label>

      {hasSound && (
        <button
          type="button"
          className="button button--icon"
          onClick={toggleMuted}
          aria-label="Mute sound"
          aria-pressed={muted}
          title="Mute the preview's sound: music and clips (M)"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  );
}

/** Play from the start if the playhead is at the end; otherwise toggle. */
export function togglePlayback(durationMs: number): void {
  const { playing, timeMs, play, pause, seek } = usePlaybackStore.getState();
  if (playing) {
    pause();
    return;
  }
  if (durationMs <= 0) return;
  if (timeMs >= durationMs) seek(0);
  play();
}

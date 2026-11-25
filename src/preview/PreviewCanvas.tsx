import { useEffect, useRef } from 'react';
import type { Format } from '../domain/project';
import { mediaCache } from '../media';
import { audibleAt, soundSegments } from '../render/clipSound';
import { renderFrame } from '../render/renderFrame';
import { useEditorStore } from '../store/editorStore';
import { usePlaybackStore } from './playbackStore';

/**
 * The live preview. The canvas always has the project's full output resolution
 * (e.g. 1080×1920) and is scaled down with CSS, so preview pixels match export pixels.
 *
 * Drawing happens outside React: we subscribe to the stores directly and redraw at most
 * once per animation frame, so playback doesn't re-render any components.
 */
export function PreviewCanvas({ format }: { format: Format }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;

    let scheduled = 0;
    const draw = () => {
      scheduled = 0;
      const project = useEditorStore.getState().project;
      if (!project) return;
      const { timeMs, playing, muted } = usePlaybackStore.getState();
      mediaCache.setPlaying(playing);
      mediaCache.setSound(audibleAt(soundSegments(project.scenes, mediaCache.assetInfo), timeMs), muted);
      mediaCache.beginFrame();
      renderFrame(ctx, project, timeMs, mediaCache.preview);
      mediaCache.endFrame(); // pauses clips that are no longer on screen
    };
    const requestDraw = () => {
      if (!scheduled) scheduled = requestAnimationFrame(draw);
    };

    draw();
    const unsubscribeProject = useEditorStore.subscribe((state, previous) => {
      if (state.project !== previous.project) requestDraw();
    });
    const unsubscribePlayback = usePlaybackStore.subscribe((state, previous) => {
      if (state.timeMs !== previous.timeMs || state.playing !== previous.playing || state.muted !== previous.muted) requestDraw();
    });
    // Redraw when media finishes decoding or a paused clip lands on its seek target.
    const unsubscribeMedia = mediaCache.subscribe(requestDraw);
    // System fonts can finish loading after the first paint; redraw when they do.
    void document.fonts?.ready.then(requestDraw);

    return () => {
      unsubscribeProject();
      unsubscribePlayback();
      unsubscribeMedia();
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [format.width, format.height]);

  return (
    <canvas
      ref={canvasRef}
      className="preview-canvas"
      width={format.width}
      height={format.height}
      role="img"
      aria-label="Story preview"
      data-testid="preview-canvas"
    />
  );
}

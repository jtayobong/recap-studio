import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Format, Scene, Style } from '../domain/project';
import { mediaCache } from '../media';
import { renderFrame } from '../render/renderFrame';
import { posterTimeMs } from '../render/templates/registry';

const THUMB_WIDTH = 108;

/**
 * A scene's poster frame, drawn by the real renderer at 1/10 scale.
 * Redraws only when this scene, the format or the style changes, or a media thumbnail loads.
 * Media comes from the small stored thumbnails, never the preview's video elements.
 */
export function SceneThumbnail({ scene, format, style }: { scene: Scene; format: Format; style: Style }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((THUMB_WIDTH * format.height) / format.width);
  const mediaVersion = useSyncExternalStore(mediaCache.subscribeThumbnails, mediaCache.thumbnailVersion);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    const scale = THUMB_WIDTH / format.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Render the scene on its own, without its entrance transition.
    renderFrame(ctx, { format, style, scenes: [{ ...scene, transitionIn: 'cut' }] }, posterTimeMs(scene), mediaCache.thumbnails);
  }, [scene, format, style, mediaVersion]);

  return <canvas ref={ref} className="scene-thumb" width={THUMB_WIDTH} height={height} aria-hidden="true" />;
}

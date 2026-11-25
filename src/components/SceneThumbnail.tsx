import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Format, Scene, Style } from '../domain/project';
import { mediaCache } from '../media';
import { renderFrame } from '../render/renderFrame';
import { posterTimeMs } from '../render/templates/registry';

/** Canvas pixels across: 2× the CSS width (54 px for 9:16, 96 px for 16:9) for sharp thumbnails. */
const thumbWidth = (format: Format) => (format.width > format.height ? 192 : 108);

/**
 * A scene's poster frame, drawn by the real renderer at 1/10 scale in either shape.
 * Redraws only when this scene, the format or the style changes, or a media thumbnail loads.
 * Media comes from the small stored thumbnails, never the preview's video elements.
 */
export function SceneThumbnail({ scene, format, style }: { scene: Scene; format: Format; style: Style }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = thumbWidth(format);
  const height = Math.round((width * format.height) / format.width);
  const mediaVersion = useSyncExternalStore(mediaCache.subscribeThumbnails, mediaCache.thumbnailVersion);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    const scale = thumbWidth(format) / format.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Render the scene on its own, without its entrance transition.
    renderFrame(ctx, { format, style, scenes: [{ ...scene, transitionIn: 'cut' }] }, posterTimeMs(scene), mediaCache.thumbnails);
  }, [scene, format, style, mediaVersion]);

  const className = format.width > format.height ? 'scene-thumb scene-thumb--landscape' : 'scene-thumb';
  return <canvas ref={ref} className={className} width={width} height={height} aria-hidden="true" />;
}

import { useEffect, useRef } from 'react';
import type { Format, Scene, Style } from '../domain/project';
import { renderFrame } from '../render/renderFrame';
import { posterTimeMs } from '../render/templates/registry';

const THUMB_WIDTH = 108;

/**
 * A scene's poster frame, drawn by the real renderer at 1/10 scale.
 * Redraws only when this scene, the format or the style changes.
 */
export function SceneThumbnail({ scene, format, style }: { scene: Scene; format: Format; style: Style }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((THUMB_WIDTH * format.height) / format.width);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    const scale = THUMB_WIDTH / format.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Render the scene on its own, without its entrance transition.
    renderFrame(ctx, { format, style, scenes: [{ ...scene, transitionIn: 'cut' }] }, posterTimeMs(scene));
  }, [scene, format, style]);

  return <canvas ref={ref} className="scene-thumb" width={THUMB_WIDTH} height={height} aria-hidden="true" />;
}

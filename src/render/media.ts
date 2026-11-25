import type { AssetKind } from '../domain/asset';
import { isolated, withAlpha, type Ctx2D } from './context';

/**
 * How templates get pixels for imported media without breaking purity.
 *
 * `renderFrame` stays synchronous: the caller passes a resolver that answers immediately with
 * whatever is decoded right now, or `undefined` (still loading, missing, or no media support).
 * Templates must then draw a placeholder. The preview uses a cache that loads on demand and
 * requests a redraw when something arrives; the exporter (M5) will wait until every asset of a
 * frame is ready before drawing it, so exported frames are complete and deterministic.
 */
export interface MediaFrame {
  source: CanvasImageSource;
  /** Intrinsic size of `source` in pixels. */
  width: number;
  height: number;
  kind: AssetKind;
}

export interface MediaResolver {
  /**
   * Pixels for an asset. For video, `clipTimeMs` is the time within the clip (clamped by the
   * resolver to the clip's length, so a clip shorter than its scene holds its last frame).
   */
  frame(assetId: string, clipTimeMs: number): MediaFrame | undefined;
}

/** Resolver with no media: every slot draws its placeholder. Default for tests and old callers. */
export const NO_MEDIA: MediaResolver = { frame: () => undefined };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MediaFit = 'cover' | 'contain';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Source rectangle that fills a `box` (cover), cropping the overflow.
 * `focusX/focusY` (0–1) pick which part of the source stays visible; `zoom` ≥ 1 crops further.
 */
export function coverRect(
  srcWidth: number,
  srcHeight: number,
  box: { width: number; height: number },
  focusX = 0.5,
  focusY = 0.5,
  zoom = 1,
): Rect {
  const scale = Math.max(box.width / srcWidth, box.height / srcHeight) * Math.max(1, zoom);
  const width = Math.min(srcWidth, box.width / scale);
  const height = Math.min(srcHeight, box.height / scale);
  // Center the crop on the focus point, then keep it inside the source.
  const x = clamp(srcWidth * clamp(focusX, 0, 1) - width / 2, 0, srcWidth - width);
  const y = clamp(srcHeight * clamp(focusY, 0, 1) - height / 2, 0, srcHeight - height);
  return { x, y, width, height };
}

/** Destination rectangle that shows the whole source inside `box` (contain), centered. */
export function containRect(srcWidth: number, srcHeight: number, box: Rect): Rect {
  const scale = Math.min(box.width / srcWidth, box.height / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

export interface DrawMediaOptions {
  fit: MediaFit;
  focusX?: number;
  focusY?: number;
  /** ≥ 1; for cover only (a slow Ken Burns zoom). */
  zoom?: number;
  /** For contain: color drawn over the cropped backdrop so the letterboxed media stands out. */
  backdropTint?: string;
  backdropTintAlpha?: number;
}

/** Draw media into `box`, clipped to it. */
export function drawMedia(ctx: Ctx2D, media: MediaFrame, box: Rect, options: DrawMediaOptions): void {
  const { width: sw, height: sh } = media;
  if (sw <= 0 || sh <= 0) return;
  isolated(ctx, () => {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const cover = coverRect(sw, sh, box, options.focusX, options.focusY, options.fit === 'cover' ? options.zoom : 1);
    ctx.drawImage(media.source, cover.x, cover.y, cover.width, cover.height, box.x, box.y, box.width, box.height);
    if (options.fit === 'cover') return;

    // Contain: the cropped copy above becomes a dimmed backdrop for the whole picture.
    const tint = options.backdropTint;
    if (tint) {
      withAlpha(ctx, options.backdropTintAlpha ?? 0.7, () => {
        ctx.fillStyle = tint;
        ctx.fillRect(box.x, box.y, box.width, box.height);
      });
    }
    const dest = containRect(sw, sh, box);
    ctx.drawImage(media.source, 0, 0, sw, sh, dest.x, dest.y, dest.width, dest.height);
  });
}

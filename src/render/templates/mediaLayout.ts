import { isolated, withAlpha, type Ctx2D, type Theme } from '../context';
import type { Rect } from '../media';
import { cssFont, fitSingleLine } from '../text';

/**
 * Layout helpers shared by the media templates (Photo / Video, Photo grid, Photo carousel).
 * Pure geometry, so the inspector can compute the same cell shapes (crop aspect for the focus
 * picker) that the template draws.
 */

/** Reference output size: only the 9:16 story format is enabled. */
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

export type GridLayout = 'two' | 'three' | 'four';

/**
 * Cells of the photo grid, in slot order. Portrait stacks (2 above each other, 1 big on top + 2
 * below); landscape puts them side by side (2 next to each other, 1 big on the left + 2 stacked on
 * the right). 2 × 2 is the same in both. Margins and gaps scale with the shorter side.
 */
export function gridCells(layout: GridLayout, width: number, height: number): Rect[] {
  const unit = Math.min(width, height);
  const margin = unit * 0.045;
  const gap = unit * 0.025;
  const x = margin;
  const y = margin;
  const w = width - margin * 2;
  const h = height - margin * 2;
  if (width > height && layout === 'two') {
    const cell = (w - gap) / 2;
    return [
      { x, y, width: cell, height: h },
      { x: x + cell + gap, y, width: cell, height: h },
    ];
  }
  if (width > height && layout === 'three') {
    const big = (w - gap) * 0.6;
    const small = (h - gap) / 2;
    const right = x + big + gap;
    return [
      { x, y, width: big, height: h },
      { x: right, y, width: w - gap - big, height: small },
      { x: right, y: y + small + gap, width: w - gap - big, height: small },
    ];
  }
  if (layout === 'two') {
    const cell = (h - gap) / 2;
    return [
      { x, y, width: w, height: cell },
      { x, y: y + cell + gap, width: w, height: cell },
    ];
  }
  if (layout === 'three') {
    const top = (h - gap) * 0.56;
    const bottom = h - gap - top;
    const half = (w - gap) / 2;
    return [
      { x, y, width: w, height: top },
      { x, y: y + top + gap, width: half, height: bottom },
      { x: x + half + gap, y: y + top + gap, width: half, height: bottom },
    ];
  }
  const half = (w - gap) / 2;
  const cell = (h - gap) / 2;
  return [
    { x, y, width: half, height: cell },
    { x: x + half + gap, y, width: half, height: cell },
    { x, y: y + cell + gap, width: half, height: cell },
    { x: x + half + gap, y: y + cell + gap, width: half, height: cell },
  ];
}

export type CarouselDirection = 'up' | 'left';

/** Card size of the carousel strip for a direction. */
export function carouselCard(direction: CarouselDirection, width: number, height: number): { width: number; height: number } {
  return direction === 'left'
    ? { width: width * 0.72, height: height * 0.56 }
    : { width: width * 0.84, height: height * 0.4 };
}

/** width ÷ height of a rect, for the focus picker's crop outline. */
export const aspectOf = (r: { width: number; height: number }) => r.width / r.height;

/** Dashed empty-slot card with a short label ("Add a photo or clip", "Photo 2", …). */
export function drawMediaPlaceholder(ctx: Ctx2D, box: Rect, theme: Theme, label: string): void {
  const { palette, fonts } = theme;
  const { x, y, width: w, height: h } = box;
  isolated(ctx, () => {
    ctx.fillStyle = palette.surface;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = Math.max(2, w * 0.006);
    ctx.setLineDash([w * 0.03, w * 0.022]);
    withAlpha(ctx, 0.35, () => ctx.strokeRect(x, y, w, h));

    const font = { family: fonts.body, weight: 700 };
    const size = fitSingleLine(ctx, label, font, w * 0.8, Math.min(w * 0.075, h * 0.12), Math.min(w * 0.04, h * 0.06));
    ctx.font = cssFont(font, size);
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    withAlpha(ctx, 0.6, () => ctx.fillText(label, x + w / 2, y + h / 2));
  });
}

/** Clip subsequent drawing to a rounded rectangle (call inside `isolated`). */
export function clipRounded(ctx: Ctx2D, box: Rect, radius: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(box.x, box.y, box.width, box.height, radius);
  else ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
}

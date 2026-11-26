import { isolated, withAlpha, type Ctx2D, type Theme } from '../context';
import { easeInOutCubic, progress } from '../easing';
import type { Rect } from '../media';
import { cssFont, fitSingleLine } from '../text';

/**
 * Layout helpers shared by the media templates (Photo / Video, Photo grid, Photo carousel).
 * Pure geometry, so the inspector can compute the same cell shapes (crop aspect for the focus
 * picker) that the template draws.
 */

/** Reference frame per shape, for crop shapes in field descriptors (the focus picker). */
export const REFERENCE_SIZES = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
} as const;

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

/**
 * Card size of the carousel strip for a direction. In landscape the cards are wide but leave the
 * neighbours peeking in (sideways) or the title room (upwards).
 */
export function carouselCard(direction: CarouselDirection, width: number, height: number): { width: number; height: number } {
  if (width > height) {
    return direction === 'left' ? { width: height * 0.9, height: height * 0.62 } : { width: width * 0.56, height: height * 0.6 };
  }
  return direction === 'left'
    ? { width: width * 0.72, height: height * 0.56 }
    : { width: width * 0.84, height: height * 0.4 };
}

/** Longest move from one card to the next in a step-and-pause strip; shorter when beats are short. */
const STEP_MOVE_MAX_MS = 650;
/** Share of a beat spent moving at most (the rest the card holds still). */
const STEP_MOVE_SHARE = 0.35;

/**
 * Step-and-pause strip position at scene-local time `t`, in cards: 0 = first card centred,
 * `count - 1` = last. The scene is split into one equal beat per card; each card holds still for
 * most of its beat and the strip moves on to the next card at the end of it. The last card holds
 * to the end. Shared by the text carousel and the photo carousel's "Stop at each photo".
 */
export function stepPosition(t: number, durationMs: number, count: number): number {
  if (count <= 1 || durationMs <= 0) return 0;
  const beat = durationMs / count;
  const moveMs = Math.min(STEP_MOVE_MAX_MS, beat * STEP_MOVE_SHARE);
  const index = Math.min(count - 1, Math.max(0, Math.floor(t / beat)));
  const moving = index < count - 1 ? easeInOutCubic(progress(t - index * beat, beat - moveMs, moveMs)) : 0;
  return index + moving;
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

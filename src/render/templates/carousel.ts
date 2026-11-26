import { isolated, withAlpha } from '../context';
import { easeInOutCubic, easeOutCubic, lerp, progress } from '../easing';
import type { FieldDefs, MediaField } from '../fields';
import { drawMedia, type Rect } from '../media';
import { cssFont, fitText } from '../text';
import { aspectOf, carouselCard, clipRounded, drawMediaPlaceholder, REFERENCE_SIZES, stepPosition, type CarouselDirection } from './mediaLayout';
import { isLandscape, unitOf } from '../layout';
import { clipSoundFields } from './soundFields';
import { fillBackground } from '../backdrop';
import { defineTemplate } from './types';

const ACCEPT = ['image', 'video'] as const;
export const CAROUSEL_SLOTS = 6;

const cardAspects = (shape: keyof typeof REFERENCE_SIZES) => {
  const { width, height } = REFERENCE_SIZES[shape];
  return { up: aspectOf(carouselCard('up', width, height)), left: aspectOf(carouselCard('left', width, height)) };
};
const cardAspectsByShape = { portrait: cardAspects('portrait'), landscape: cardAspects('landscape') };

function slotFields(index: number): FieldDefs {
  const n = index + 1;
  // One more slot appears as the previous one is filled (a filled slot always stays visible).
  const visibleWhen =
    index === 0 ? undefined : { anyOf: [{ field: `media${index}`, filled: true as const }, { field: `media${n}`, filled: true as const }] };
  const media: MediaField = {
    kind: 'media',
    label: `Photo ${n}`,
    default: '',
    accept: ACCEPT,
    focus: { x: `focus${n}X`, y: `focus${n}Y`, aspect: { field: 'direction', byShape: cardAspectsByShape } },
    visibleWhen,
  };
  return {
    [`media${n}`]: media,
    [`focus${n}X`]: { kind: 'number', label: `Photo ${n} focus across`, default: 0.5, min: 0, max: 1, step: 0.01 },
    [`focus${n}Y`]: { kind: 'number', label: `Photo ${n} focus down`, default: 0.5, min: 0, max: 1, step: 0.01 },
  };
}

const fields = {
  direction: {
    kind: 'choice',
    label: 'Direction',
    default: 'left',
    options: [
      { value: 'left', label: 'Horizontal (scrolls left)' },
      { value: 'up', label: 'Vertical (scrolls up)' },
    ],
  },
  movement: {
    kind: 'choice',
    label: 'Movement',
    default: 'glide',
    options: [
      { value: 'glide', label: 'Smooth glide' },
      { value: 'step', label: 'Stop at each photo' },
    ],
  },
  title: { kind: 'text', label: 'Title', default: 'Moments from the year', maxLength: 50 },
  ...clipSoundFields,
  ...Object.assign({}, ...Array.from({ length: CAROUSEL_SLOTS }, (_, i) => slotFields(i))),
} satisfies FieldDefs;

/**
 * Where the strip is at scene-local time `t`: 0 = first card centred, 1 = last card centred.
 * Eased only at the very start and end, so the scroll reads as continuous.
 */
export function carouselProgress(t: number, durationMs: number): number {
  const p = progress(t, 0, durationMs);
  return lerp(p, easeInOutCubic(p), 0.25);
}

/**
 * Strip position (0–1) for a movement: a continuous glide, or a stop at each of `count` cards
 * (the text carousel's step-and-pause timing).
 */
export function carouselStripPosition(movement: string, t: number, durationMs: number, count: number): number {
  if (movement !== 'step') return carouselProgress(t, durationMs);
  return count <= 1 ? 0 : stepPosition(t, durationMs, count) / (count - 1);
}

/**
 * Card rects for `count` cards at strip position `p` (0–1), in slot order. The strip moves from the
 * first card centred to the last card centred, left or up.
 */
export function carouselCards(direction: CarouselDirection, count: number, p: number, width: number, height: number): Rect[] {
  const card = carouselCard(direction, width, height);
  const along = direction === 'left' ? card.width : card.height;
  const gap = Math.min(width, height) * 0.05;
  // Card centre down the frame: lower in landscape, where the title takes a bigger share.
  const wide = width > height;
  const centreY = wide ? 0.58 : direction === 'left' ? 0.52 : 0.55;
  const step = along + gap;
  const travel = Math.max(0, count - 1) * step * p;
  return Array.from({ length: count }, (_, i) => {
    const offset = i * step - travel;
    return direction === 'left'
      ? { x: (width - card.width) / 2 + offset, y: height * centreY - card.height / 2, width: card.width, height: card.height }
      : { x: (width - card.width) / 2, y: height * centreY - card.height / 2 + offset, width: card.width, height: card.height };
  });
}

/** Up to 6 photos or clips on a strip that glides across the screen during the scene. */
export const carouselTemplate = defineTemplate({
  id: 'carousel',
  name: 'Photo carousel',
  description: 'Up to six photos or clips gliding past (or stopping at each), sideways or upwards.',
  defaultDurationMs: 6000,
  defaultTransition: 'fade',
  posterMs: 1200,
  fields,

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t, durationMs } = frame;
    const v = values as Record<string, string | number | boolean>;
    const direction: CarouselDirection = v.direction === 'up' ? 'up' : 'left';
    const u = unitOf(frame);
    const wide = isLandscape(frame);
    const titleX = wide ? W * 0.06 : W * 0.08;
    const titleTop = wide ? H * 0.07 : H * 0.06;

    fillBackground(ctx, frame, theme);

    // Filled slots in order; with none filled, three placeholders show what the scene does.
    const filled = Array.from({ length: CAROUSEL_SLOTS }, (_, i) => i + 1).filter((n) => String(v[`media${n}`] ?? '') !== '');
    const slots = filled.length > 0 ? filled : [1, 2, 3];
    const cards = carouselCards(direction, slots.length, carouselStripPosition(String(v.movement), t, durationMs, slots.length), W, H);

    cards.forEach((card, i) => {
      // Skip cards entirely off screen.
      if (card.x + card.width < 0 || card.x > W || card.y + card.height < 0 || card.y > H) return;
      const n = slots[i]!;
      const assetId = String(v[`media${n}`] ?? '');
      const media = assetId ? frame.media.frame(assetId, t) : undefined;
      isolated(ctx, () => {
        clipRounded(ctx, card, u * 0.035);
        if (media && (ACCEPT as readonly string[]).includes(media.kind)) {
          drawMedia(ctx, media, card, { fit: 'cover', focusX: Number(v[`focus${n}X`]), focusY: Number(v[`focus${n}Y`]) });
        } else {
          drawMediaPlaceholder(ctx, card, theme, `Photo ${n}`);
        }
      });
    });

    const title = String(v.title ?? '').trim();
    if (title) {
      const font = { family: fonts.display, weight: 900 };
      const fitted = fitText(ctx, title, {
        font,
        maxWidth: wide ? W * 0.88 : W * 0.84,
        maxHeight: wide ? H * 0.16 : H * 0.12,
        maxSize: u * 0.09,
        minSize: u * 0.05,
        lineHeight: 1.05,
        maxLines: 2,
      });
      const enter = easeOutCubic(progress(t, 0, 500));
      // Vertical strips run under the title, so give it a solid band.
      if (direction === 'up') {
        const bandHeight = titleTop + fitted.lines.length * fitted.lineHeightPx + (wide ? H * 0.04 : H * 0.03);
        fillBackground(ctx, frame, theme, { x: 0, y: 0, width: W, height: bandHeight });
      }
      withAlpha(ctx, enter, () => {
        ctx.font = cssFont(font, fitted.sizePx);
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        fitted.lines.forEach((line, i) => ctx.fillText(line, titleX, titleTop + fitted.sizePx + i * fitted.lineHeightPx - (1 - enter) * 20));
      });
    }
  },
});

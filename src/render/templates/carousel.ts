import { isolated, withAlpha } from '../context';
import { easeInOutCubic, easeOutCubic, lerp, progress } from '../easing';
import type { FieldDefs, MediaField } from '../fields';
import { drawMedia, type Rect } from '../media';
import { cssFont, fitText } from '../text';
import { aspectOf, carouselCard, clipRounded, drawMediaPlaceholder, STORY_SIZE, type CarouselDirection } from './mediaLayout';
import { defineTemplate } from './types';

const ACCEPT = ['image', 'video'] as const;
export const CAROUSEL_SLOTS = 6;

const cardAspects = {
  up: aspectOf(carouselCard('up', STORY_SIZE.width, STORY_SIZE.height)),
  left: aspectOf(carouselCard('left', STORY_SIZE.width, STORY_SIZE.height)),
};

function slotFields(index: number): FieldDefs {
  const n = index + 1;
  const media: MediaField = {
    kind: 'media',
    label: `Photo ${n}`,
    default: '',
    accept: ACCEPT,
    focus: { x: `focus${n}X`, y: `focus${n}Y`, aspect: { field: 'direction', byValue: cardAspects } },
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
  title: { kind: 'text', label: 'Title', default: 'Moments from the year', maxLength: 50 },
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
 * Card rects for `count` cards at strip position `p` (0–1), in slot order. The strip moves from the
 * first card centred to the last card centred, left or up.
 */
export function carouselCards(direction: CarouselDirection, count: number, p: number, width: number, height: number): Rect[] {
  const card = carouselCard(direction, width, height);
  const along = direction === 'left' ? card.width : card.height;
  const gap = width * 0.05;
  const step = along + gap;
  const travel = Math.max(0, count - 1) * step * p;
  return Array.from({ length: count }, (_, i) => {
    const offset = i * step - travel;
    return direction === 'left'
      ? { x: (width - card.width) / 2 + offset, y: height * 0.52 - card.height / 2, width: card.width, height: card.height }
      : { x: (width - card.width) / 2, y: height * 0.55 - card.height / 2 + offset, width: card.width, height: card.height };
  });
}

/** Up to 6 photos or clips on a strip that glides across the screen during the scene. */
export const carouselTemplate = defineTemplate({
  id: 'carousel',
  name: 'Photo carousel',
  description: 'Up to six photos or clips gliding past, sideways or upwards.',
  defaultDurationMs: 6000,
  defaultTransition: 'fade',
  posterMs: 1200,
  fields,

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t, durationMs } = frame;
    const v = values as Record<string, string | number | boolean>;
    const direction: CarouselDirection = v.direction === 'up' ? 'up' : 'left';

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    // Filled slots in order; with none filled, three placeholders show what the scene does.
    const filled = Array.from({ length: CAROUSEL_SLOTS }, (_, i) => i + 1).filter((n) => String(v[`media${n}`] ?? '') !== '');
    const slots = filled.length > 0 ? filled : [1, 2, 3];
    const cards = carouselCards(direction, slots.length, carouselProgress(t, durationMs), W, H);

    cards.forEach((card, i) => {
      // Skip cards entirely off screen.
      if (card.x + card.width < 0 || card.x > W || card.y + card.height < 0 || card.y > H) return;
      const n = slots[i]!;
      const assetId = String(v[`media${n}`] ?? '');
      const media = assetId ? frame.media.frame(assetId, t) : undefined;
      isolated(ctx, () => {
        clipRounded(ctx, card, W * 0.035);
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
        maxWidth: W * 0.84,
        maxHeight: H * 0.12,
        maxSize: W * 0.09,
        minSize: W * 0.05,
        lineHeight: 1.05,
        maxLines: 2,
      });
      const enter = easeOutCubic(progress(t, 0, 500));
      // Vertical strips run under the title, so give it a solid band.
      if (direction === 'up') {
        ctx.fillStyle = palette.background;
        ctx.fillRect(0, 0, W, H * 0.06 + fitted.lines.length * fitted.lineHeightPx + H * 0.03);
      }
      withAlpha(ctx, enter, () => {
        ctx.font = cssFont(font, fitted.sizePx);
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        fitted.lines.forEach((line, i) => ctx.fillText(line, W * 0.08, H * 0.06 + fitted.sizePx + i * fitted.lineHeightPx - (1 - enter) * 20));
      });
    }
  },
});

import type { FontPair, Palette } from '../../domain/stylePresets';
import { isolated, withAlpha, type Ctx2D } from '../context';
import { easeInOutCubic, easeOutCubic, lerp, progress } from '../easing';
import type { FieldDefs, TextField } from '../fields';
import type { Rect } from '../media';
import { cssFont, fitText } from '../text';
import { isLandscape, unitOf } from '../layout';
import { carouselCard, clipRounded, type CarouselDirection } from './mediaLayout';
import { fillBackground } from '../backdrop';
import { defineTemplate } from './types';

export const TEXT_CAROUSEL_CARDS = 6;

/** The strip slides in to the first card over this long at the start of the scene. */
export const TEXT_CAROUSEL_ENTER_MS = 500;
/** Longest move from one card to the next; shorter when beats are short. */
const MOVE_MAX_MS = 650;
/** Share of a beat spent moving at most (the rest the card holds still, to be read). */
const MOVE_SHARE = 0.35;

const DEFAULT_CARDS: readonly [string, string][] = [
  ['Lisbon', '12 days in May'],
  ['First marathon', '42.2 km in 4:12'],
  ['New job', 'Started in September'],
];

function cardFields(index: number): FieldDefs {
  const n = index + 1;
  // Card n appears once card n-1 has a headline (a filled card always stays visible).
  const visibleWhen =
    index === 0 ? undefined : { anyOf: [{ field: `headline${index}`, filled: true as const }, { field: `headline${n}`, filled: true as const }] };
  const [headline, detail] = DEFAULT_CARDS[index] ?? ['', ''];
  const headlineField: TextField = { kind: 'text', label: `Card ${n} headline`, default: headline, maxLength: 40, multiline: true, visibleWhen };
  const detailField: TextField = { kind: 'text', label: `Card ${n} small line`, default: detail, maxLength: 70, multiline: true, visibleWhen };
  return { [`headline${n}`]: headlineField, [`detail${n}`]: detailField };
}

const fields = {
  direction: {
    kind: 'choice',
    label: 'Direction',
    default: 'left',
    options: [
      { value: 'left', label: 'Horizontal (slides left)' },
      { value: 'up', label: 'Vertical (slides up)' },
    ],
  },
  title: { kind: 'text', label: 'Title', default: 'Highlights of the year', maxLength: 50 },
  ...Object.assign({}, ...Array.from({ length: TEXT_CAROUSEL_CARDS }, (_, i) => cardFields(i))),
} satisfies FieldDefs;

/**
 * Strip position at scene-local time `t`, in cards: 0 = first card centred, `count - 1` = last.
 * The scene is split into one equal beat per card; each card holds still for most of its beat and
 * the strip moves on to the next card at the end of it (step and pause). The last card holds to
 * the end. At the very start the strip slides in from half a card back.
 */
export function textCarouselPosition(t: number, durationMs: number, count: number): number {
  const entering = lerp(-0.5, 0, easeOutCubic(progress(t, 0, TEXT_CAROUSEL_ENTER_MS)));
  if (count <= 1 || durationMs <= 0) return entering;
  const beat = durationMs / count;
  const moveMs = Math.min(MOVE_MAX_MS, beat * MOVE_SHARE);
  const index = Math.min(count - 1, Math.max(0, Math.floor(t / beat)));
  const moving = index < count - 1 ? easeInOutCubic(progress(t - index * beat, beat - moveMs, moveMs)) : 0;
  return entering + index + moving;
}

/** Where the centred card's middle sits, as a share of the frame height. */
const stripCentreY = (wide: boolean) => (wide ? 0.58 : 0.53);

/** Card rects at strip position `position` (in cards), in card order. */
export function textCarouselCards(direction: CarouselDirection, count: number, position: number, width: number, height: number): Rect[] {
  const wide = width > height;
  const base = carouselCard(direction, width, height);
  // Text needs less height than a photo: vertical cards are a bit shorter, so more of the
  // neighbours show; horizontal ones keep the photo carousel's shape.
  const card = direction === 'up' ? { width: base.width, height: base.height * (wide ? 0.8 : 0.75) } : base;
  const gap = Math.min(width, height) * 0.05;
  const centreY = stripCentreY(wide);
  const step = (direction === 'left' ? card.width : card.height) + gap;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - position) * step;
    return direction === 'left'
      ? { x: (width - card.width) / 2 + offset, y: height * centreY - card.height / 2, width: card.width, height: card.height }
      : { x: (width - card.width) / 2, y: height * centreY - card.height / 2 + offset, width: card.width, height: card.height };
  });
}

/** Headline and small line of each filled card, in order (a card counts once it has a headline). */
export function filledCards(values: Readonly<Record<string, unknown>>): { headline: string; detail: string }[] {
  const cards: { headline: string; detail: string }[] = [];
  for (let n = 1; n <= TEXT_CAROUSEL_CARDS; n += 1) {
    const headline = String(values[`headline${n}`] ?? '').trim();
    if (headline) cards.push({ headline, detail: String(values[`detail${n}`] ?? '').trim() });
  }
  return cards;
}

/** Up to 6 text cards that slide in one at a time and pause to be read, sideways or upwards. */
export const textCarouselTemplate = defineTemplate({
  id: 'text-carousel',
  name: 'Text carousel',
  description: 'Up to six short highlights, one card at a time, sideways or upwards.',
  defaultDurationMs: 7500,
  defaultTransition: 'fade',
  posterMs: 900,
  fields,

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t, durationMs } = frame;
    const v = values as Record<string, string>;
    const direction: CarouselDirection = v.direction === 'up' ? 'up' : 'left';
    const u = unitOf(frame);
    const wide = isLandscape(frame);
    const titleX = wide ? W * 0.06 : W * 0.08;
    const titleTop = wide ? H * 0.07 : H * 0.06;

    fillBackground(ctx, frame, theme);

    // With no cards filled, three sample cards show what the scene does.
    const filled = filledCards(v);
    const cards = filled.length > 0 ? filled : [1, 2, 3].map((n) => ({ headline: `Highlight ${n}`, detail: '' }));
    const sample = filled.length === 0;
    const position = textCarouselPosition(t, durationMs, cards.length);
    const rects = textCarouselCards(direction, cards.length, position, W, H);
    const fadeIn = easeOutCubic(progress(t, 0, TEXT_CAROUSEL_ENTER_MS));

    withAlpha(ctx, fadeIn, () => {
      rects.forEach((rect, i) => {
        if (rect.x + rect.width < 0 || rect.x > W || rect.y + rect.height < 0 || rect.y > H) return;
        // The centred card is fully lit; neighbours are dimmed so the eye stays on the one to read.
        const focus = 1 - Math.min(1, Math.abs(i - position));
        withAlpha(ctx, lerp(0.45, 1, focus) * (sample ? 0.6 : 1), () => drawCard(ctx, rect, cards[i]!, u, palette, fonts));
      });
    });

    // Dots: which card is showing, out of how many. Under the strip when it moves sideways; in a
    // column at the right edge when it moves upwards (the strip runs past the bottom).
    if (cards.length > 1) {
      const r = u * 0.011;
      const spacing = r * 3.2;
      const run = (cards.length - 1) * spacing;
      const at = (i: number) =>
        direction === 'left'
          ? { x: W / 2 - run / 2 + i * spacing, y: wide ? H * 0.94 : H * 0.9 }
          : { x: W - (wide ? W * 0.035 : W * 0.04), y: H * stripCentreY(wide) - run / 2 + i * spacing };
      cards.forEach((_, i) => {
        const near = 1 - Math.min(1, Math.abs(i - position));
        const { x, y } = at(i);
        withAlpha(ctx, fadeIn * lerp(0.35, 1, near), () => {
          ctx.fillStyle = near > 0.5 ? palette.accent : palette.text;
          ctx.beginPath();
          ctx.arc(x, y, r * lerp(1, 1.35, near), 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

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

function drawCard(
  ctx: Ctx2D,
  rect: Rect,
  card: { headline: string; detail: string },
  u: number,
  palette: Palette,
  fonts: FontPair,
): void {
  isolated(ctx, () => {
    clipRounded(ctx, rect, u * 0.035);
    ctx.fillStyle = palette.surface;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    const pad = Math.min(rect.width, rect.height) * 0.1;
    const innerW = rect.width - pad * 2;
    // Accent bar in the top-left corner.
    ctx.fillStyle = palette.accent;
    ctx.fillRect(rect.x + pad, rect.y + pad, innerW * 0.18, u * 0.012);

    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 600 };
    const headline = fitText(ctx, card.headline, {
      font: display,
      maxWidth: innerW,
      maxHeight: rect.height * (card.detail ? 0.42 : 0.6),
      maxSize: u * 0.12,
      minSize: u * 0.045,
      lineHeight: 1.02,
      maxLines: 3,
    });
    const detail = card.detail
      ? fitText(ctx, card.detail, { font: body, maxWidth: innerW, maxHeight: rect.height * 0.26, maxSize: u * 0.06, minSize: u * 0.03, lineHeight: 1.25, maxLines: 3 })
      : undefined;
    const gap = detail ? headline.sizePx * 0.45 : 0;
    const blockH = headline.lines.length * headline.lineHeightPx + gap + (detail ? detail.lines.length * detail.lineHeightPx : 0);
    // Centred down the card, left-aligned under the accent bar.
    let y = rect.y + (rect.height - blockH) / 2 + pad * 0.25;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.text;
    ctx.font = cssFont(display, headline.sizePx);
    for (const line of headline.lines) {
      ctx.fillText(line, rect.x + pad, y + headline.sizePx * 0.85);
      y += headline.lineHeightPx;
    }
    if (detail) {
      y += gap;
      ctx.font = cssFont(body, detail.sizePx);
      withAlpha(ctx, 0.8, () => {
        for (const line of detail.lines) {
          ctx.fillText(line, rect.x + pad, y + detail.sizePx * 0.85);
          y += detail.lineHeightPx;
        }
      });
    }
  });
}

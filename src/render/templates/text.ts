import { withAlpha, type Ctx2D } from '../context';
import { easeOutBack, easeOutCubic, progress } from '../easing';
import { cssFont, fitText, wrapLines, type FontSpec } from '../text';
import { isLandscape, unitOf } from '../layout';
import { fillBackground, motionAmount } from '../backdrop';
import { defineTemplate } from './types';

/** At most this many bullets are drawn (one per non-empty line of the body). */
export const TEXT_MAX_BULLETS = 8;
/** The first bullet starts to appear here; the last one has started by `REVEAL_END_MS`. */
const REVEAL_START_MS = 700;
const REVEAL_END_MS = 2000;
const REVEAL_STAGGER_MS = 380;
const ENTER_MS = 450;

/** Non-empty, trimmed body lines, capped at `TEXT_MAX_BULLETS`. */
export function bulletItems(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, TEXT_MAX_BULLETS);
}

/** When bullet `index` of `count` starts to appear: staggered, all started by `REVEAL_END_MS`. */
export function bulletStartMs(index: number, count: number): number {
  const stagger = count <= 1 ? 0 : Math.min(REVEAL_STAGGER_MS, (REVEAL_END_MS - REVEAL_START_MS) / (count - 1));
  return REVEAL_START_MS + index * stagger;
}

interface FittedBullets {
  sizePx: number;
  lineHeightPx: number;
  /** Space between two bullets. */
  gapPx: number;
  items: string[][];
}

/** Largest size at which every bullet, wrapped beside its marker, fits the box together. */
function fitBullets(ctx: Ctx2D, items: string[], font: FontSpec, maxWidth: number, maxHeight: number, maxSize: number, minSize: number): FittedBullets {
  let size = maxSize;
  for (;;) {
    const indent = size * 1.1;
    const wrapped = items.map((item) => wrapLines(ctx, item, font, size, maxWidth - indent));
    const lineHeightPx = size * 1.25;
    const gapPx = size * 0.55;
    const lines = wrapped.reduce((sum, item) => sum + item.length, 0);
    const height = lines * lineHeightPx + Math.max(0, wrapped.length - 1) * gapPx;
    const widest = Math.max(0, ...wrapped.flat().map((line) => ctx.measureText(line).width));
    if ((height <= maxHeight && widest <= maxWidth - indent) || size <= minSize) {
      return { sizePx: size, lineHeightPx, gapPx, items: wrapped };
    }
    size = Math.max(minSize, size * 0.95);
  }
}

/** A slide-style scene: a title and a body of bullets (revealed one by one) or a paragraph. */
export const textTemplate = defineTemplate({
  id: 'text',
  name: 'Text',
  description: 'A title with bullet points or a paragraph, like a slide.',
  defaultDurationMs: 6000,
  defaultTransition: 'fade',
  posterMs: 2500,
  fields: {
    title: { kind: 'text', label: 'Title', default: 'What this year taught me', maxLength: 60, multiline: true },
    layout: {
      kind: 'choice',
      label: 'Body',
      default: 'bullets',
      options: [
        { value: 'bullets', label: 'Bullets (one per line)' },
        { value: 'paragraph', label: 'Paragraph' },
      ],
    },
    body: {
      kind: 'text',
      label: 'Text',
      default: 'Say yes to the trip\nRest is part of the work\nCall your friends more often',
      maxLength: 500,
      multiline: true,
    },
  },

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t } = frame;
    const u = unitOf(frame);
    const m = motionAmount(theme);
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 600 };
    const g = isLandscape(frame)
      ? { left: W * 0.07, maxWidth: W * 0.8, titleTop: H * 0.12, titleMaxHeight: H * 0.24, bodyBottom: H * 0.88, disc: { x: W, y: H, r: H * 0.42 } }
      : { left: W * 0.08, maxWidth: W * 0.84, titleTop: H * 0.13, titleMaxHeight: H * 0.2, bodyBottom: H * 0.86, disc: { x: W, y: H, r: W * 0.36 } };

    fillBackground(ctx, frame, theme);

    // A soft disc in the corner (surface colour, so text over it stays readable).
    const grow = easeOutBack(progress(t, 0, 900));
    ctx.fillStyle = palette.surface;
    ctx.beginPath();
    ctx.arc(g.disc.x, g.disc.y, Math.max(0, g.disc.r * grow * (1 + 0.025 * m * Math.sin(t / 650))), 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Title: lines slide up with a small stagger.
    const title = fitText(ctx, values.title.trim(), {
      font: display,
      maxWidth: g.maxWidth,
      maxHeight: g.titleMaxHeight,
      maxSize: u * 0.12,
      minSize: u * 0.05,
      lineHeight: 1.05,
      maxLines: 3,
    });
    const titleLines = title.lines.filter(Boolean);
    const firstBaseline = g.titleTop + title.sizePx * 0.9;
    ctx.fillStyle = palette.text;
    titleLines.forEach((line, i) => {
      const enter = easeOutCubic(progress(t, 100 + i * 110, 550));
      withAlpha(ctx, enter, () => {
        ctx.font = cssFont(display, title.sizePx);
        ctx.fillText(line, g.left, firstBaseline + i * title.lineHeightPx + (1 - enter) * title.sizePx * 0.4);
      });
    });

    // Accent bar under the title, drawing itself across.
    const titleBottom = titleLines.length > 0 ? firstBaseline + (titleLines.length - 1) * title.lineHeightPx + title.sizePx * 0.3 : g.titleTop;
    const barY = titleBottom + u * 0.02;
    const bar = easeOutCubic(progress(t, 350, 600));
    if (bar > 0) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(g.left, barY, g.maxWidth * 0.22 * bar, u * 0.014);
    }

    const bodyTop = barY + u * 0.08;
    const bodyHeight = Math.max(0, g.bodyBottom - bodyTop);

    if (values.layout === 'paragraph') {
      const text = values.body.trim();
      if (!text) return;
      const paragraph = fitText(ctx, text, {
        font: body,
        maxWidth: g.maxWidth,
        maxHeight: bodyHeight,
        maxSize: u * 0.055,
        minSize: u * 0.025,
        lineHeight: 1.35,
      });
      const enter = easeOutCubic(progress(t, REVEAL_START_MS, 700));
      ctx.fillStyle = palette.text;
      withAlpha(ctx, enter * 0.92, () => {
        ctx.font = cssFont(body, paragraph.sizePx);
        paragraph.lines.forEach((line, i) => {
          ctx.fillText(line, g.left, bodyTop + paragraph.sizePx + i * paragraph.lineHeightPx + (1 - enter) * u * 0.02);
        });
      });
      return;
    }

    const items = bulletItems(values.body);
    if (items.length === 0) return;
    const bullets = fitBullets(ctx, items, body, g.maxWidth, bodyHeight, u * 0.06, u * 0.025);
    const indent = bullets.sizePx * 1.1;
    let y = bodyTop;
    bullets.items.forEach((lines, i) => {
      const enter = easeOutCubic(progress(t, bulletStartMs(i, items.length), ENTER_MS));
      const shift = (1 - enter) * u * 0.04;
      withAlpha(ctx, enter, () => {
        // Marker: an accent dot on the first line.
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(g.left + bullets.sizePx * 0.3 + shift, y + bullets.sizePx * 0.62, bullets.sizePx * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.text;
        ctx.font = cssFont(body, bullets.sizePx);
        lines.forEach((line, j) => ctx.fillText(line, g.left + indent + shift, y + bullets.sizePx * 0.95 + j * bullets.lineHeightPx));
      });
      y += lines.length * bullets.lineHeightPx + bullets.gapPx;
    });
  },
});

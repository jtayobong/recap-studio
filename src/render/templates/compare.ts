import { isolated, withAlpha } from '../context';
import { easeOutBack, easeOutCubic, easeOutExpo, lerp, progress } from '../easing';
import { cssFont, fitSingleLine, fitText } from '../text';
import { isLandscape, unitOf } from '../layout';
import { fillBackground } from '../backdrop';
import { defineTemplate } from './types';

// Fixed locale so a project renders identically on every machine.
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Signed percentage change, e.g. "+58%", or '' when it can't be computed. */
export function percentChange(from: number, to: number): string {
  if (from <= 0) return '';
  const change = Math.round(((to - from) / from) * 100);
  return `${change > 0 ? '+' : ''}${numberFormat.format(change)}%`;
}

/** Two stats, before → after: bars grow to scale, the bigger one is emphasised. */
export const compareTemplate = defineTemplate({
  id: 'compare',
  name: 'Compare',
  description: 'Two numbers side by side, like last year vs this year.',
  defaultDurationMs: 5000,
  defaultTransition: 'slide',
  posterMs: 2600,
  fields: {
    title: { kind: 'text', label: 'Title', default: 'Trips taken', maxLength: 50, multiline: true },
    leftLabel: { kind: 'text', label: 'First label', default: '2025', maxLength: 24 },
    leftValue: { kind: 'number', label: 'First number', default: 12, min: 0, max: 999_999_999, step: 1 },
    rightLabel: { kind: 'text', label: 'Second label', default: '2026', maxLength: 24 },
    rightValue: { kind: 'number', label: 'Second number', default: 19, min: 0, max: 999_999_999, step: 1 },
    unit: { kind: 'text', label: 'Unit', default: 'trips', maxLength: 24 },
    showChange: { kind: 'boolean', label: 'Show % change', default: true },
  },

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t } = frame;
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 700 };
    const u = unitOf(frame);
    const wide = isLandscape(frame);
    const left = wide ? W * 0.06 : W * 0.08;
    const maxBar = W * 0.84;
    // Landscape: two upright bars side by side on a shared baseline, the change badge on the right.
    const columns = { width: W * 0.26, bar: W * 0.15, centers: [W * 0.22, W * 0.53], baseline: H * 0.8, maxBar: H * 0.36 };

    fillBackground(ctx, frame, theme);

    const title = fitText(ctx, values.title, {
      font: display,
      maxWidth: wide ? W * 0.88 : W * 0.84,
      maxHeight: wide ? H * 0.16 : H * 0.14,
      maxSize: u * 0.11,
      minSize: u * 0.05,
      lineHeight: 1.05,
      maxLines: 2,
    });
    const titleIn = easeOutCubic(progress(t, 0, 450));
    withAlpha(ctx, titleIn, () => {
      ctx.font = cssFont(display, title.sizePx);
      ctx.fillStyle = palette.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const titleTop = wide ? H * 0.07 : H * 0.14;
      title.lines.forEach((line, i) => ctx.fillText(line, left, titleTop + title.sizePx + i * title.lineHeightPx));
    });

    const largest = Math.max(values.leftValue, values.rightValue, 1);
    const rows = [
      { label: values.leftLabel, value: values.leftValue, y: H * 0.42, start: 400 },
      { label: values.rightLabel, value: values.rightValue, y: H * 0.64, start: 900 },
    ];
    // Same font size for both numbers, fitted to the longer one, so they compare visually.
    const numberSize = Math.min(
      ...rows.map((row) =>
        fitSingleLine(ctx, `${numberFormat.format(row.value)} ${values.unit}`.trim(), display, wide ? columns.width : W * 0.84, u * 0.12, u * 0.05),
      ),
    );

    rows.forEach((row, index) => {
      const emphasised = row.value === largest && values.leftValue !== values.rightValue;
      const grow = easeOutExpo(progress(t, row.start, 1100));
      const shown = Math.round(row.value * grow);
      const labelIn = progress(t, row.start - 150, 300);

      if (wide) {
        const cx = columns.centers[index] ?? W / 2;
        withAlpha(ctx, labelIn, () => {
          ctx.font = cssFont(body, fitSingleLine(ctx, row.label, body, columns.width, u * 0.05, u * 0.03));
          ctx.fillStyle = palette.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(row.label, cx, columns.baseline + u * 0.075);
        });
        const barHeight = Math.max(u * 0.02, (row.value / largest) * columns.maxBar) * grow;
        withAlpha(ctx, emphasised ? 1 : 0.35, () => {
          ctx.fillStyle = emphasised ? palette.primary : palette.text;
          ctx.fillRect(cx - columns.bar / 2, columns.baseline - barHeight, columns.bar, barHeight);
        });
        withAlpha(ctx, labelIn, () => {
          isolated(ctx, () => {
            const pop = emphasised ? lerp(0.85, 1, easeOutBack(progress(t, row.start + 600, 500))) : 1;
            ctx.translate(cx, columns.baseline - barHeight - u * 0.03);
            ctx.scale(pop, pop);
            ctx.font = cssFont(display, numberSize);
            ctx.fillStyle = emphasised ? palette.accent : palette.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(`${numberFormat.format(shown)} ${values.unit}`.trim(), 0, 0);
          });
        });
        return;
      }

      withAlpha(ctx, labelIn, () => {
        ctx.font = cssFont(body, u * 0.05);
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(row.label, left, row.y - H * 0.035);
      });

      // Bar, scaled to the larger value.
      const barWidth = Math.max(u * 0.02, (row.value / largest) * maxBar) * grow;
      // The smaller bar is translucent text colour: visible on every palette's background.
      withAlpha(ctx, emphasised ? 1 : 0.35, () => {
        ctx.fillStyle = emphasised ? palette.primary : palette.text;
        ctx.fillRect(left, row.y, barWidth, H * 0.05);
      });

      withAlpha(ctx, labelIn, () => {
        isolated(ctx, () => {
          const pop = emphasised ? lerp(0.85, 1, easeOutBack(progress(t, row.start + 600, 500))) : 1;
          ctx.translate(left, row.y + H * 0.05 + numberSize * 1.05);
          ctx.scale(pop, pop);
          ctx.font = cssFont(display, numberSize);
          ctx.fillStyle = emphasised ? palette.accent : palette.text;
          ctx.fillText(`${numberFormat.format(shown)} ${values.unit}`.trim(), 0, 0);
        });
      });
    });

    const change = values.showChange ? percentChange(values.leftValue, values.rightValue) : '';
    if (change) {
      const badgeIn = easeOutBack(progress(t, 2000, 500));
      withAlpha(ctx, progress(t, 2000, 200), () => {
        isolated(ctx, () => {
          const size = wide ? u * 0.11 : u * 0.075;
          if (wide) ctx.translate(W * 0.94, H * 0.55);
          else ctx.translate(W * 0.92, H * 0.88);
          ctx.scale(badgeIn, badgeIn);
          ctx.font = cssFont(display, size);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = palette.primary;
          ctx.fillText(change, 0, 0);
        });
      });
    }
  },
});

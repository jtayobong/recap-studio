import { isolated, withAlpha } from '../context';
import { easeOutBack, easeOutCubic, progress } from '../easing';
import { cssFont, fitSingleLine, fitText } from '../text';
import { defineTemplate } from './types';

/** Gap between items entering. */
const STAGGER_MS = 220;
const FIRST_ITEM_MS = 550;

/** Ranked list ("Your top 5 …"): items slide in one by one, number 1 emphasised. */
export const topListTemplate = defineTemplate({
  id: 'top-list',
  name: 'Top 5',
  description: 'A ranked list that builds up one item at a time.',
  defaultDurationMs: 5500,
  defaultTransition: 'slide',
  posterMs: FIRST_ITEM_MS + 4 * STAGGER_MS + 600,
  fields: {
    title: { kind: 'text', label: 'Title', default: 'Your top 5 artists', maxLength: 50, multiline: true },
    item1: { kind: 'text', label: '#1', default: 'The Midnight Owls', maxLength: 40 },
    item2: { kind: 'text', label: '#2', default: 'Coral Static', maxLength: 40 },
    item3: { kind: 'text', label: '#3', default: 'Neon Harbor', maxLength: 40 },
    item4: { kind: 'text', label: '#4', default: 'Velvet Engines', maxLength: 40 },
    item5: { kind: 'text', label: '#5', default: 'Paper Satellites', maxLength: 40 },
  },

  render(ctx, frame, values, { palette, fonts }) {
    const { width: W, height: H, localMs: t } = frame;
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 800 };
    const left = W * 0.08;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    // A tall accent bar on the left grows in.
    const bar = easeOutCubic(progress(t, 0, 600));
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, H * (1 - bar), W * 0.035, H * bar);

    // Title.
    const title = fitText(ctx, values.title, {
      font: display,
      maxWidth: W * 0.84,
      maxHeight: H * 0.16,
      maxSize: W * 0.1,
      minSize: W * 0.05,
      lineHeight: 1.05,
      maxLines: 2,
    });
    const titleIn = easeOutCubic(progress(t, 100, 450));
    withAlpha(ctx, titleIn, () => {
      ctx.font = cssFont(display, title.sizePx);
      ctx.fillStyle = palette.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      title.lines.forEach((line, i) => {
        ctx.fillText(line, left, H * 0.12 + title.sizePx + i * title.lineHeightPx - (1 - titleIn) * 30);
      });
    });

    // Items: empty ones are skipped, the rest keep their rank.
    const items = [values.item1, values.item2, values.item3, values.item4, values.item5]
      .map((text, i) => ({ text: text.trim(), rank: i + 1 }))
      .filter((item) => item.text !== '');
    const top = H * 0.34;
    const rowHeight = H * 0.11;
    items.forEach((item, i) => {
      const enter = progress(t, FIRST_ITEM_MS + i * STAGGER_MS, 500);
      const slide = easeOutCubic(enter);
      const y = top + i * rowHeight;
      const isFirst = item.rank === 1;
      withAlpha(ctx, enter, () => {
        isolated(ctx, () => {
          ctx.translate((1 - slide) * W * 0.4, 0);
          // Row background for #1.
          if (isFirst) {
            const pop = easeOutBack(enter);
            ctx.fillStyle = palette.primary;
            ctx.fillRect(left - W * 0.02, y - rowHeight * 0.1, (W * 0.88) * pop, rowHeight * 0.9);
          }
          const rankSize = W * 0.11;
          ctx.font = cssFont(display, rankSize);
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillStyle = isFirst ? palette.background : palette.accent;
          ctx.fillText(String(item.rank), left, y + rowHeight * 0.35);
          const textLeft = left + W * 0.14;
          const textSize = fitSingleLine(ctx, item.text, body, W * 0.68, W * 0.065, W * 0.035);
          ctx.font = cssFont(body, textSize);
          ctx.fillStyle = isFirst ? palette.background : palette.text;
          ctx.fillText(item.text, textLeft, y + rowHeight * 0.35);
        });
      });
    });
  },
});

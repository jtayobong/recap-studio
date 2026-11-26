import { withAlpha } from '../context';
import { easeOutBack, easeOutCubic, progress } from '../easing';
import { cssFont, fitSingleLine, fitText } from '../text';
import { isLandscape, unitOf } from '../layout';
import { defineTemplate } from './types';

/** Chapter divider: a label ("Part 2"), a big title and a small line, between parts of the story. */
export const sectionTemplate = defineTemplate({
  id: 'section',
  name: 'Section',
  description: 'A short divider that opens a new part of the story.',
  defaultDurationMs: 2500,
  defaultTransition: 'fade',
  posterMs: 1300,
  fields: {
    label: { kind: 'text', label: 'Label', default: 'Part 2', maxLength: 30 },
    title: { kind: 'text', label: 'Title', default: 'Summer', maxLength: 40, multiline: true },
    subtitle: { kind: 'text', label: 'Small line', default: 'June to August', maxLength: 80, multiline: true },
  },

  render(ctx, frame, values, { palette, fonts }) {
    const { width: W, height: H, localMs: t } = frame;
    const u = unitOf(frame);
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 600 };
    // Portrait: text in a column across the middle, a disc rising in the bottom-right corner.
    // Landscape: text in a left column, the disc on the right, clear of the text.
    const g = isLandscape(frame)
      ? { left: W * 0.06, maxWidth: W * 0.55, labelY: H * 0.3, titleTop: H * 0.35, titleMaxHeight: H * 0.36, disc: { x: W * 0.88, y: H * 0.86, r: H * 0.46 } }
      : { left: W * 0.08, maxWidth: W * 0.84, labelY: H * 0.38, titleTop: H * 0.425, titleMaxHeight: H * 0.24, disc: { x: W * 0.96, y: H * 0.97, r: W * 0.42 } };

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    // Disc: pops up from its corner.
    const grow = easeOutBack(progress(t, 0, 900));
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(g.disc.x, g.disc.y, Math.max(0, g.disc.r * grow), 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.text;

    // Label, then an accent bar drawing itself under it.
    const label = values.label.trim().toUpperCase();
    const labelFont = { ...body, weight: 800 };
    const labelSize = fitSingleLine(ctx, label, labelFont, g.maxWidth, u * 0.05, u * 0.03);
    if (label) {
      withAlpha(ctx, progress(t, 100, 350), () => {
        ctx.font = cssFont(labelFont, labelSize);
        ctx.fillText(label, g.left, g.labelY);
      });
    }
    const bar = easeOutCubic(progress(t, 200, 600));
    if (bar > 0) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(g.left, g.labelY + labelSize * 0.45, g.maxWidth * 0.32 * bar, u * 0.016);
      ctx.fillStyle = palette.text;
    }

    // Title: each line slides up with a small stagger.
    const title = fitText(ctx, values.title, {
      font: display,
      maxWidth: g.maxWidth,
      maxHeight: g.titleMaxHeight,
      maxSize: u * 0.22,
      minSize: u * 0.07,
      lineHeight: 1.0,
      maxLines: 3,
    });
    const firstBaseline = g.titleTop + title.sizePx * 0.9;
    title.lines.forEach((line, i) => {
      const enter = easeOutCubic(progress(t, 350 + i * 110, 550));
      withAlpha(ctx, enter, () => {
        ctx.font = cssFont(display, title.sizePx);
        ctx.fillText(line, g.left, firstBaseline + i * title.lineHeightPx + (1 - enter) * title.sizePx * 0.5);
      });
    });

    // Small line.
    const subtitleText = values.subtitle.trim();
    if (subtitleText) {
      const subtitle = fitText(ctx, subtitleText, {
        font: body,
        maxWidth: g.maxWidth,
        maxHeight: H * 0.1,
        maxSize: u * 0.05,
        minSize: u * 0.03,
        lineHeight: 1.3,
        maxLines: 2,
      });
      const top = firstBaseline + (title.lines.length - 1) * title.lineHeightPx + title.sizePx * 0.5;
      const enter = easeOutCubic(progress(t, 750, 500));
      withAlpha(ctx, enter * 0.85, () => {
        ctx.font = cssFont(body, subtitle.sizePx);
        subtitle.lines.forEach((line, i) => ctx.fillText(line, g.left, top + subtitle.sizePx + i * subtitle.lineHeightPx + (1 - enter) * 16));
      });
    }
  },
});

import { isolated, withAlpha } from '../context';
import { easeOutBack, easeOutCubic, lerp, progress } from '../easing';
import { cssFont, fitSingleLine, fitText } from '../text';
import { defineTemplate } from './types';

/** Opening card: a big headline with a "sun" and a sweeping accent band. */
export const titleTemplate = defineTemplate({
  id: 'title',
  name: 'Title',
  description: 'An opening card with a big headline.',
  defaultDurationMs: 3500,
  defaultTransition: 'fade',
  posterMs: 1500,
  fields: {
    kicker: { kind: 'text', label: 'Kicker', default: 'Your year, replayed', maxLength: 40 },
    title: { kind: 'text', label: 'Title', default: 'My 2026\nRecap', maxLength: 60, multiline: true },
    subtitle: {
      kind: 'text',
      label: 'Subtitle',
      default: "Let's look back at the highlights.",
      maxLength: 90,
      multiline: true,
    },
  },

  render(ctx, frame, values, { palette, fonts }) {
    const { width: W, height: H, localMs: t } = frame;
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 600 };
    const left = W * 0.08;
    const maxWidth = W * 0.84;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    // Sun: pops in, then breathes gently.
    const grow = easeOutBack(progress(t, 0, 800));
    const breathe = 1 + 0.02 * Math.sin(t / 700);
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(W * 0.8, H * 0.2, Math.max(0, W * 0.6 * grow * breathe), 0, Math.PI * 2);
    ctx.fill();

    // Accent band sweeping in from the left.
    isolated(ctx, () => {
      const sweep = easeOutCubic(progress(t, 150, 700));
      ctx.translate(lerp(-W * 1.3, 0, sweep), H * 0.43);
      ctx.rotate(-0.21);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(-W * 0.1, -H * 0.025, W * 0.95, H * 0.05);
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.text;

    // Kicker.
    const kicker = values.kicker.toUpperCase();
    const kickerFont = { ...body, weight: 800 };
    const kickerSize = fitSingleLine(ctx, kicker, kickerFont, maxWidth, W * 0.042, W * 0.025);
    withAlpha(ctx, progress(t, 300, 400), () => {
      ctx.font = cssFont(kickerFont, kickerSize);
      ctx.fillText(kicker, left, H * 0.56);
    });

    // Headline: each line slides up with a small stagger.
    const headline = fitText(ctx, values.title, {
      font: display,
      maxWidth,
      maxHeight: H * 0.24,
      maxSize: W * 0.19,
      minSize: W * 0.06,
      lineHeight: 1.0,
      maxLines: 4,
    });
    const firstBaseline = H * 0.58 + headline.sizePx * 0.9;
    headline.lines.forEach((line, i) => {
      const enter = easeOutCubic(progress(t, 380 + i * 110, 600));
      withAlpha(ctx, enter, () => {
        ctx.font = cssFont(display, headline.sizePx);
        ctx.fillText(line, left, firstBaseline + i * headline.lineHeightPx + (1 - enter) * headline.sizePx * 0.5);
      });
    });

    // Subtitle.
    const subtitle = fitText(ctx, values.subtitle, {
      font: body,
      maxWidth,
      maxHeight: H * 0.1,
      maxSize: W * 0.048,
      minSize: W * 0.03,
      lineHeight: 1.3,
      maxLines: 3,
    });
    const subtitleTop = firstBaseline + (headline.lines.length - 1) * headline.lineHeightPx + headline.sizePx * 0.55;
    const subEnter = easeOutCubic(progress(t, 900, 500));
    withAlpha(ctx, subEnter, () => {
      ctx.font = cssFont(body, subtitle.sizePx);
      subtitle.lines.forEach((line, i) => {
        ctx.fillText(line, left, subtitleTop + subtitle.sizePx + i * subtitle.lineHeightPx + (1 - subEnter) * 20);
      });
    });
  },
});

import { isolated, withAlpha } from '../context';
import { easeOutBack, easeOutCubic, lerp, progress } from '../easing';
import { cssFont, fitSingleLine, fitText } from '../text';
import { isLandscape, unitOf } from '../layout';
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
    const u = unitOf(frame);
    // Portrait: sun top-right, band across the middle, text in the lower half.
    // Landscape: text column on the left, sun on the right, band across the top.
    const g = isLandscape(frame)
      ? {
          left: W * 0.06,
          maxWidth: W * 0.5,
          sun: { x: W * 0.84, y: H * 0.34, r: u * 0.5 },
          band: { y: H * 0.14, rotate: -0.08, x: -W * 0.05, h: u * 0.09, w: W * 0.62 },
          kickerY: H * 0.36,
          headlineTop: H * 0.39,
          headlineMaxHeight: H * 0.36,
          subtitleMaxHeight: H * 0.14,
        }
      : {
          left: W * 0.08,
          maxWidth: W * 0.84,
          sun: { x: W * 0.8, y: H * 0.2, r: W * 0.6 },
          band: { y: H * 0.43, rotate: -0.21, x: -W * 0.1, h: H * 0.05, w: W * 0.95 },
          kickerY: H * 0.56,
          headlineTop: H * 0.58,
          headlineMaxHeight: H * 0.24,
          subtitleMaxHeight: H * 0.1,
        };
    const { left, maxWidth } = g;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    // Sun: pops in, then breathes gently.
    const grow = easeOutBack(progress(t, 0, 800));
    const breathe = 1 + 0.02 * Math.sin(t / 700);
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(g.sun.x, g.sun.y, Math.max(0, g.sun.r * grow * breathe), 0, Math.PI * 2);
    ctx.fill();

    // Accent band sweeping in from the left.
    isolated(ctx, () => {
      const sweep = easeOutCubic(progress(t, 150, 700));
      ctx.translate(lerp(-W * 1.3, 0, sweep), g.band.y);
      ctx.rotate(g.band.rotate);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(g.band.x, -g.band.h / 2, g.band.w, g.band.h);
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.text;

    // Kicker.
    const kicker = values.kicker.toUpperCase();
    const kickerFont = { ...body, weight: 800 };
    const kickerSize = fitSingleLine(ctx, kicker, kickerFont, maxWidth, u * 0.042, u * 0.025);
    withAlpha(ctx, progress(t, 300, 400), () => {
      ctx.font = cssFont(kickerFont, kickerSize);
      ctx.fillText(kicker, left, g.kickerY);
    });

    // Headline: each line slides up with a small stagger.
    const headline = fitText(ctx, values.title, {
      font: display,
      maxWidth,
      maxHeight: g.headlineMaxHeight,
      maxSize: u * 0.19,
      minSize: u * 0.06,
      lineHeight: 1.0,
      maxLines: 4,
    });
    const firstBaseline = g.headlineTop + headline.sizePx * 0.9;
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
      maxHeight: g.subtitleMaxHeight,
      maxSize: u * 0.048,
      minSize: u * 0.03,
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

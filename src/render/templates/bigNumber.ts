import { isolated, withAlpha } from '../context';
import { easeOutBack, easeOutCubic, easeOutExpo, lerp, progress } from '../easing';
import { cssFont, fitSingleLine, fitText } from '../text';
import { isLandscape, unitOf } from '../layout';
import { defineTemplate } from './types';

// Fixed locale so a project renders identically on every machine.
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** One huge stat that counts up, with a label above and a caption below. */
export const bigNumberTemplate = defineTemplate({
  id: 'big-number',
  name: 'Big Number',
  description: 'One headline stat that counts up.',
  defaultDurationMs: 5000,
  defaultTransition: 'slide',
  posterMs: 2400,
  fields: {
    label: { kind: 'text', label: 'Label', default: 'You listened for', maxLength: 60 },
    value: { kind: 'number', label: 'Number', default: 48213, min: 0, max: 999_999_999, step: 1 },
    unit: { kind: 'text', label: 'Unit', default: 'minutes', maxLength: 30 },
    caption: {
      kind: 'text',
      label: 'Caption',
      default: "That's more than 33 days of music.",
      maxLength: 120,
      multiline: true,
    },
    countUp: { kind: 'boolean', label: 'Count up', default: true },
  },

  render(ctx, frame, values, { palette, fonts }) {
    const { width: W, height: H, localMs: t, durationMs } = frame;
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 700 };
    const centerX = W / 2;
    const u = unitOf(frame);
    // Portrait: a tall centred stack. Landscape: the same stack, spread for the shorter frame.
    const g = isLandscape(frame)
      ? { circle: { x: W * 0.05, y: H * 0.95, r: u * 0.3 }, numberMaxWidth: W * 0.7, labelMaxY: H * 0.2, baseline: H * 0.54, captionTop: H * 0.79, captionMaxWidth: W * 0.6, captionMaxHeight: H * 0.14, captionLines: 2 }
      : { circle: { x: W * 0.08, y: H * 0.93, r: W * 0.32 }, numberMaxWidth: W * 0.86, labelMaxY: H * 0.34, baseline: H * 0.5, captionTop: H * 0.68, captionMaxWidth: W * 0.8, captionMaxHeight: H * 0.12, captionLines: 3 };

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    // Slowly drifting diagonal stripes.
    isolated(ctx, () => {
      const stripe = u * 0.12;
      const drift = (t * 0.04) % (stripe * 2);
      ctx.translate(centerX, H / 2);
      ctx.rotate(-0.35);
      ctx.fillStyle = palette.surface;
      for (let i = -12; i <= 12; i += 1) {
        ctx.fillRect(i * stripe * 2 + drift, -H, stripe, H * 2);
      }
    });

    // Accent circle bottom-left.
    const circle = easeOutBack(progress(t, 500, 700));
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(g.circle.x, g.circle.y, Math.max(0, g.circle.r * circle), 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // The number's size is fitted to the final value so it doesn't jump while counting.
    const finalText = numberFormat.format(values.value);
    const numberSize = fitSingleLine(ctx, finalText, display, g.numberMaxWidth, u * 0.34, u * 0.08);

    // Label: sits above the number, moving up when a short number is drawn very large.
    const labelSize = fitSingleLine(ctx, values.label, body, W * 0.84, u * 0.062, u * 0.03);
    const labelBaseline = Math.min(g.labelMaxY, g.baseline - numberSize * 0.8 - u * 0.04);
    const labelIn = easeOutCubic(progress(t, 0, 450));
    withAlpha(ctx, labelIn, () => {
      ctx.font = cssFont(body, labelSize);
      ctx.fillStyle = palette.text;
      ctx.fillText(values.label, centerX, labelBaseline + (1 - labelIn) * 40);
    });
    const countDuration = Math.min(1800, durationMs * 0.5);
    const shownValue = values.countUp
      ? Math.round(values.value * easeOutExpo(progress(t, 250, countDuration)))
      : values.value;
    const shownText = numberFormat.format(shownValue);
    const baseline = g.baseline;
    const pop = lerp(0.7, 1, easeOutBack(progress(t, 200, 550)));
    const shadowOffset = u * 0.014;

    withAlpha(ctx, progress(t, 200, 200), () => {
      isolated(ctx, () => {
        ctx.translate(centerX, baseline - numberSize * 0.35);
        ctx.scale(pop, pop);
        ctx.font = cssFont(display, numberSize);
        ctx.fillStyle = palette.primary;
        ctx.fillText(shownText, shadowOffset, numberSize * 0.35 + shadowOffset);
        ctx.fillStyle = palette.text;
        ctx.fillText(shownText, 0, numberSize * 0.35);
      });
    });

    // Unit.
    const unitSize = fitSingleLine(ctx, values.unit, display, W * 0.8, u * 0.1, u * 0.04);
    const unitIn = easeOutCubic(progress(t, 700, 400));
    withAlpha(ctx, unitIn, () => {
      ctx.font = cssFont(display, unitSize);
      ctx.fillStyle = palette.accent;
      ctx.fillText(values.unit, centerX, baseline + numberSize * 0.1 + unitSize * 1.15 + (1 - unitIn) * 30);
    });

    // Caption.
    const caption = fitText(ctx, values.caption, {
      font: { ...body, weight: 600 },
      maxWidth: g.captionMaxWidth,
      maxHeight: g.captionMaxHeight,
      maxSize: u * 0.052,
      minSize: u * 0.03,
      lineHeight: 1.3,
      maxLines: g.captionLines,
    });
    const captionIn = easeOutCubic(progress(t, 1400, 500));
    withAlpha(ctx, captionIn, () => {
      ctx.font = cssFont({ ...body, weight: 600 }, caption.sizePx);
      ctx.fillStyle = palette.text;
      caption.lines.forEach((line, i) => {
        ctx.fillText(line, centerX, g.captionTop + i * caption.lineHeightPx + (1 - captionIn) * 20);
      });
    });
  },
});

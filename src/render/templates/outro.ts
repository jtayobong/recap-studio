import { isolated, withAlpha } from '../context';
import { easeInCubic, easeOutCubic, lerp, progress } from '../easing';
import { cssFont, fitText } from '../text';
import { defineTemplate } from './types';

/** How long the closing animation (gentle zoom-out and fade) lasts at the end of the scene. */
export const OUTRO_END_MS = 900;

/** Closing card: expanding rings, a big line and a message; eases out at the very end. */
export const outroTemplate = defineTemplate({
  id: 'outro',
  name: 'Outro',
  description: 'A closing card that ends the story softly.',
  defaultDurationMs: 4500,
  defaultTransition: 'fade',
  posterMs: 1500,
  fields: {
    title: { kind: 'text', label: 'Title', default: 'See you\nnext year', maxLength: 50, multiline: true },
    message: { kind: 'text', label: 'Message', default: 'Thanks for reliving it with me.', maxLength: 100, multiline: true },
    fadeToBlack: { kind: 'boolean', label: 'Fade out at the end', default: true },
  },

  render(ctx, frame, values, { palette, fonts }) {
    const { width: W, height: H, localMs: t, durationMs } = frame;
    const display = { family: fonts.display, weight: 900 };
    const body = { family: fonts.body, weight: 600 };
    const cx = W / 2;
    const cy = H * 0.45;
    // 0 → 1 over the last OUTRO_END_MS of the scene.
    const ending = values.fadeToBlack ? easeInCubic(progress(t, durationMs - OUTRO_END_MS, OUTRO_END_MS)) : 0;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    isolated(ctx, () => {
      // The whole card settles back slightly as it ends.
      const settle = lerp(1, 0.94, ending);
      ctx.translate(cx, cy);
      ctx.scale(settle, settle);
      ctx.translate(-cx, -cy);

      // Three rings expanding outward around the title, one after another.
      for (let i = 0; i < 3; i += 1) {
        const grow = easeOutCubic(progress(t, i * 250, 1400));
        ctx.strokeStyle = i === 1 ? palette.accent : palette.primary;
        ctx.lineWidth = W * 0.016;
        withAlpha(ctx, 0.85 - i * 0.25, () => {
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0, W * (0.37 + i * 0.1) * grow), 0, Math.PI * 2);
          ctx.stroke();
        });
      }

      // Narrower than the inner ring, so the text never crosses it.
      const title = fitText(ctx, values.title, {
        font: display,
        maxWidth: W * 0.62,
        maxHeight: H * 0.22,
        maxSize: W * 0.13,
        minSize: W * 0.06,
        lineHeight: 1.02,
        maxLines: 3,
      });
      const titleIn = easeOutCubic(progress(t, 350, 600));
      withAlpha(ctx, titleIn, () => {
        ctx.font = cssFont(display, title.sizePx);
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const top = cy - ((title.lines.length - 1) * title.lineHeightPx) / 2;
        title.lines.forEach((line, i) => ctx.fillText(line, cx, top + i * title.lineHeightPx + (1 - titleIn) * 24));
      });

      const message = fitText(ctx, values.message, {
        font: body,
        maxWidth: W * 0.76,
        maxHeight: H * 0.1,
        maxSize: W * 0.05,
        minSize: W * 0.03,
        lineHeight: 1.3,
        maxLines: 3,
      });
      const messageIn = easeOutCubic(progress(t, 900, 500));
      withAlpha(ctx, messageIn, () => {
        ctx.font = cssFont(body, message.sizePx);
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        message.lines.forEach((line, i) => ctx.fillText(line, cx, H * 0.75 + i * message.lineHeightPx));
      });
    });

    // Fade to the background colour at the very end.
    withAlpha(ctx, ending, () => {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, W, H);
    });
  },
});

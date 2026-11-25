import { isolated, withAlpha, type Ctx2D } from '../context';
import { easeInOutCubic, easeOutCubic, lerp, progress } from '../easing';
import { drawMedia } from '../media';
import { cssFont, fitSingleLine, fitText } from '../text';
import { defineTemplate } from './types';

const ACCEPT = ['image', 'video'] as const;

/**
 * Full-bleed photo or video clip with an optional caption.
 *
 * Video clips play from their start with the scene and hold their last frame if the scene is
 * longer. When cropped (cover), the focus point keeps the important part in frame and the slow
 * Ken Burns zoom is centered on it. While media is loading or missing, a placeholder is drawn.
 */
export const photoTemplate = defineTemplate({
  id: 'photo',
  name: 'Photo / Video',
  description: 'A full-screen photo or clip with a caption.',
  defaultDurationMs: 4000,
  defaultTransition: 'fade',
  posterMs: 900,
  fields: {
    media: {
      kind: 'media',
      label: 'Photo or clip',
      default: '',
      accept: ACCEPT,
      focus: { x: 'focusX', y: 'focusY', fit: 'fit' },
    },
    focusX: { kind: 'number', label: 'Focus across', default: 0.5, min: 0, max: 1, step: 0.01 },
    focusY: { kind: 'number', label: 'Focus down', default: 0.5, min: 0, max: 1, step: 0.01 },
    caption: { kind: 'text', label: 'Caption', default: 'The best day of the year', maxLength: 80, multiline: true },
    fit: {
      kind: 'choice',
      label: 'Fit',
      default: 'cover',
      options: [
        { value: 'cover', label: 'Fill the screen (crop)' },
        { value: 'contain', label: 'Show all (letterbox)' },
      ],
    },
    motion: {
      kind: 'choice',
      label: 'Motion',
      default: 'zoom-in',
      options: [
        { value: 'zoom-in', label: 'Slow zoom in' },
        { value: 'zoom-out', label: 'Slow zoom out' },
        { value: 'none', label: 'None' },
      ],
    },
  },

  render(ctx, frame, values, { palette, fonts }) {
    const { width: W, height: H, localMs: t } = frame;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);

    const media = values.media ? frame.media.frame(values.media, t) : undefined;
    if (media && (ACCEPT as readonly string[]).includes(media.kind)) {
      drawMedia(ctx, media, { x: 0, y: 0, width: W, height: H }, {
        fit: values.fit === 'contain' ? 'contain' : 'cover',
        focusX: values.focusX,
        focusY: values.focusY,
        zoom: kenBurnsZoom(values.motion, t, frame.durationMs),
        backdropTint: palette.background,
        backdropTintAlpha: 0.7,
      });
    } else {
      drawPlaceholder(ctx, W, H, palette, fonts.body);
    }

    // Caption on a soft band at the bottom; slides up after the media settles.
    const caption = values.caption.trim();
    if (!caption) return;
    const body = { family: fonts.body, weight: 800 };
    const fitted = fitText(ctx, caption, {
      font: body,
      maxWidth: W * 0.84,
      maxHeight: H * 0.16,
      maxSize: W * 0.075,
      minSize: W * 0.04,
      lineHeight: 1.15,
      maxLines: 3,
    });
    const blockHeight = fitted.lines.length * fitted.lineHeightPx;
    const enter = easeOutCubic(progress(t, 350, 550));
    const bottom = H * 0.9 + (1 - enter) * H * 0.03;

    withAlpha(ctx, 0.55 * enter, () => {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, bottom - blockHeight - H * 0.04, W, blockHeight + H * 0.08);
    });
    withAlpha(ctx, enter, () => {
      ctx.font = cssFont(body, fitted.sizePx);
      ctx.fillStyle = palette.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      fitted.lines.forEach((line, i) => {
        ctx.fillText(line, W * 0.08, bottom - blockHeight + fitted.sizePx + i * fitted.lineHeightPx);
      });
    });
  },
});

/** Dashed frame shown while there is no media to draw. */
function drawPlaceholder(
  ctx: Ctx2D,
  W: number,
  H: number,
  palette: { surface: string; text: string },
  bodyFamily: string,
): void {
  isolated(ctx, () => {
    const inset = W * 0.08;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(inset, H * 0.1, W - inset * 2, H * 0.62);
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.setLineDash([W * 0.02, W * 0.015]);
    withAlpha(ctx, 0.35, () => ctx.strokeRect(inset, H * 0.1, W - inset * 2, H * 0.62));

    const label = 'Add a photo or clip';
    const font = { family: bodyFamily, weight: 700 };
    const size = fitSingleLine(ctx, label, font, W * 0.7, W * 0.05, W * 0.03);
    ctx.font = cssFont(font, size);
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    withAlpha(ctx, 0.6, () => ctx.fillText(label, W / 2, H * 0.41));
  });
}

/** How far the Ken Burns motion zooms over a whole scene. */
export const KEN_BURNS_MAX_ZOOM = 1.12;

/** Zoom factor at scene-local time `t` (gently eased at both ends so cuts don't jolt). */
export function kenBurnsZoom(motion: string, t: number, durationMs: number): number {
  if (motion === 'none') return 1;
  const p = easeInOutCubic(progress(t, 0, durationMs)) * 0.85 + progress(t, 0, durationMs) * 0.15;
  return motion === 'zoom-out' ? lerp(KEN_BURNS_MAX_ZOOM, 1, p) : lerp(1, KEN_BURNS_MAX_ZOOM, p);
}

import { isolated, withAlpha, type Ctx2D, type FrameInfo, type Theme } from '../context';
import { easeInOutCubic, easeOutCubic, lerp, progress } from '../easing';
import { drawMedia, type Rect } from '../media';
import { cssFont, fitText } from '../text';
import { isLandscape, unitOf } from '../layout';
import { aspectOf, clipRounded, drawMediaPlaceholder, REFERENCE_SIZES } from './mediaLayout';
import { clipSoundFields } from './soundFields';
import { fillBackground } from '../backdrop';
import { defineTemplate } from './types';

const ACCEPT = ['image', 'video'] as const;

/**
 * The card a framed photo sits in (M12.6), with room for the caption: below it in portrait, in a
 * column to its right in landscape. Without a caption the card is centred.
 */
export function framedCard(width: number, height: number, hasCaption: boolean): Rect {
  if (width > height) {
    const card = { width: width * 0.58, height: height * 0.84 };
    return { ...card, x: hasCaption ? width * 0.05 : (width - card.width) / 2, y: (height - card.height) / 2 };
  }
  const card = { width: width * 0.86, height: height * 0.7 };
  return { ...card, x: (width - card.width) / 2, y: hasCaption ? height * 0.07 : (height - card.height) / 2 };
}

/** Crop shape of the framed card per frame shape, for the focus picker. */
const framedAspect = (shape: keyof typeof REFERENCE_SIZES) => {
  const { width, height } = REFERENCE_SIZES[shape];
  return { framed: aspectOf(framedCard(width, height, true)) };
};

/**
 * A photo or video clip with an optional caption: full-bleed, or framed in a rounded card with
 * the background around it (M12.6).
 *
 * Video clips play from their start with the scene and hold their last frame if the scene is
 * longer. When cropped (cover), the focus point keeps the important part in frame and the slow
 * Ken Burns zoom is centered on it. While media is loading or missing, a placeholder is drawn.
 */
export const photoTemplate = defineTemplate({
  id: 'photo',
  name: 'Photo / Video',
  description: 'A photo or clip, framed or full screen, with a caption.',
  defaultDurationMs: 4000,
  defaultTransition: 'fade',
  posterMs: 900,
  fields: {
    media: {
      kind: 'media',
      label: 'Photo or clip',
      default: '',
      accept: ACCEPT,
      focus: {
        x: 'focusX',
        y: 'focusY',
        fit: 'fit',
        aspect: { field: 'layout', byShape: { portrait: framedAspect('portrait'), landscape: framedAspect('landscape') } },
      },
    },
    layout: {
      kind: 'choice',
      label: 'Layout',
      default: 'framed',
      options: [
        { value: 'framed', label: 'Framed (with padding)' },
        { value: 'full', label: 'Full screen' },
      ],
    },
    focusX: { kind: 'number', label: 'Focus across', default: 0.5, min: 0, max: 1, step: 0.01 },
    focusY: { kind: 'number', label: 'Focus down', default: 0.5, min: 0, max: 1, step: 0.01 },
    ...clipSoundFields,
    caption: { kind: 'text', label: 'Caption', default: 'The best day of the year', maxLength: 80, multiline: true },
    fit: {
      kind: 'choice',
      label: 'Fit',
      default: 'cover',
      options: [
        { value: 'cover', label: 'Fill (crop)' },
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

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t } = frame;
    const u = unitOf(frame);
    // The media is full-bleed in both shapes; landscape gets a lower-third caption that keeps to
    // the left two thirds, so a wide photo stays visible above and beside it.
    const g = isLandscape(frame)
      ? { placeholder: { x: W * 0.06, y: H * 0.08, width: W * 0.88, height: H * 0.6 }, captionX: W * 0.06, captionMaxWidth: W * 0.62, captionMaxHeight: H * 0.18, captionLines: 2 }
      : { placeholder: { x: W * 0.08, y: H * 0.1, width: W * 0.84, height: H * 0.62 }, captionX: W * 0.08, captionMaxWidth: W * 0.84, captionMaxHeight: H * 0.16, captionLines: 3 };

    fillBackground(ctx, frame, theme);

    const caption = values.caption.trim();
    if (values.layout !== 'full') {
      renderFramed(ctx, frame, values, theme, caption);
      return;
    }

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
      drawMediaPlaceholder(ctx, g.placeholder, { palette, fonts }, 'Add a photo or clip');
    }

    // Caption on a soft band at the bottom; slides up after the media settles.
    if (!caption) return;
    const body = { family: fonts.body, weight: 800 };
    const fitted = fitText(ctx, caption, {
      font: body,
      maxWidth: g.captionMaxWidth,
      maxHeight: g.captionMaxHeight,
      maxSize: u * 0.075,
      minSize: u * 0.04,
      lineHeight: 1.15,
      maxLines: g.captionLines,
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
        ctx.fillText(line, g.captionX, bottom - blockHeight + fitted.sizePx + i * fitted.lineHeightPx);
      });
    });
  },
});

interface FramedValues {
  media: string;
  focusX: number;
  focusY: number;
  fit: string;
  motion: string;
}

/**
 * Framed layout: the media in a rounded card that settles in, the background (and its motion)
 * around it, and the caption on the background: under the card in portrait, beside it in
 * landscape.
 */
function renderFramed(ctx: Ctx2D, frame: FrameInfo, values: FramedValues, theme: Theme, caption: string): void {
  const { palette, fonts } = theme;
  const { width: W, height: H, localMs: t } = frame;
  const u = unitOf(frame);
  const wide = isLandscape(frame);
  const card = framedCard(W, H, caption !== '');

  // The card settles in from slightly smaller.
  const settle = easeOutCubic(progress(t, 0, 600));
  const scale = lerp(0.96, 1, settle);
  const cx = card.x + card.width / 2;
  const cy = card.y + card.height / 2;
  isolated(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    clipRounded(ctx, card, u * 0.035);
    const media = values.media ? frame.media.frame(values.media, t) : undefined;
    if (media && (ACCEPT as readonly string[]).includes(media.kind)) {
      drawMedia(ctx, media, card, {
        fit: values.fit === 'contain' ? 'contain' : 'cover',
        focusX: values.focusX,
        focusY: values.focusY,
        zoom: kenBurnsZoom(values.motion, t, frame.durationMs),
        backdropTint: palette.background,
        backdropTintAlpha: 0.7,
      });
    } else {
      drawMediaPlaceholder(ctx, card, theme, 'Add a photo or clip');
    }
  });

  if (!caption) return;
  const body = { family: fonts.body, weight: 800 };
  const area = wide
    ? { x: card.x + card.width + W * 0.04, maxWidth: W - (card.x + card.width + W * 0.04) - W * 0.05, maxHeight: H * 0.7, lines: 6 }
    : { x: card.x, maxWidth: card.width, maxHeight: H - (card.y + card.height) - H * 0.07, lines: 3 };
  const fitted = fitText(ctx, caption, {
    font: body,
    maxWidth: area.maxWidth,
    maxHeight: area.maxHeight,
    maxSize: u * 0.075,
    minSize: u * 0.04,
    lineHeight: 1.15,
    maxLines: area.lines,
  });
  const blockHeight = fitted.lines.length * fitted.lineHeightPx;
  // Portrait: centred in the space under the card. Landscape: centred beside it.
  const top = wide ? (H - blockHeight) / 2 : card.y + card.height + (H - card.y - card.height - blockHeight) / 2;
  const enter = easeOutCubic(progress(t, 350, 550));
  withAlpha(ctx, enter, () => {
    ctx.font = cssFont(body, fitted.sizePx);
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitted.lines.forEach((line, i) => ctx.fillText(line, area.x, top + fitted.sizePx * 0.9 + i * fitted.lineHeightPx + (1 - enter) * u * 0.02));
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

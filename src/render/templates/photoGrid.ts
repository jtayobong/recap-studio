import { isolated, withAlpha } from '../context';
import { easeOutCubic, lerp, progress } from '../easing';
import type { FieldDefs, FrameShape, MediaField } from '../fields';
import { drawMedia } from '../media';
import { cssFont, fitText } from '../text';
import { aspectOf, clipRounded, drawMediaPlaceholder, gridCells, REFERENCE_SIZES, type GridLayout } from './mediaLayout';
import { isLandscape, unitOf } from '../layout';
import { clipSoundFields } from './soundFields';
import { fillBackground } from '../backdrop';
import { defineTemplate } from './types';

const ACCEPT = ['image', 'video'] as const;
const LAYOUTS: GridLayout[] = ['two', 'three', 'four'];
const SLOTS = 4;
/** Visible slots per layout. */
const SLOT_COUNT: Record<GridLayout, number> = { two: 2, three: 3, four: 4 };

/** Crop shape of slot `index` in each layout and frame shape (for the inspector's focus picker). */
function slotAspects(index: number): Record<FrameShape, Record<string, number>> {
  const byShape: Record<FrameShape, Record<string, number>> = { portrait: {}, landscape: {} };
  for (const shape of ['portrait', 'landscape'] as const) {
    const { width, height } = REFERENCE_SIZES[shape];
    for (const layout of LAYOUTS) {
      const cell = gridCells(layout, width, height)[index];
      if (cell) byShape[shape][layout] = aspectOf(cell);
    }
  }
  return byShape;
}

/** Layouts that show slot `index`. */
const layoutsWithSlot = (index: number) => LAYOUTS.filter((layout) => SLOT_COUNT[layout] > index);

function slotFields(index: number): FieldDefs {
  const n = index + 1;
  // Slots the layout doesn't use are hidden in the inspector, unless they still hold media.
  const visibleWhen = index < 2 ? undefined : { anyOf: [{ field: 'layout', oneOf: layoutsWithSlot(index) }, { field: `media${n}`, filled: true as const }] };
  const media: MediaField = {
    kind: 'media',
    label: `Photo ${n}`,
    default: '',
    accept: ACCEPT,
    focus: { x: `focus${n}X`, y: `focus${n}Y`, fit: `fit${n}`, aspect: { field: 'layout', byShape: slotAspects(index) } },
    visibleWhen,
  };
  return {
    [`media${n}`]: media,
    [`focus${n}X`]: { kind: 'number', label: `Photo ${n} focus across`, default: 0.5, min: 0, max: 1, step: 0.01 },
    [`focus${n}Y`]: { kind: 'number', label: `Photo ${n} focus down`, default: 0.5, min: 0, max: 1, step: 0.01 },
    [`fit${n}`]: {
      kind: 'choice',
      visibleWhen,
      label: `Photo ${n} fit`,
      default: 'cover',
      options: [
        { value: 'cover', label: 'Fill the cell (crop)' },
        { value: 'contain', label: 'Show all' },
      ],
    },
  };
}

const fields = {
  layout: {
    kind: 'choice',
    label: 'Layout',
    default: 'three',
    options: [
      { value: 'two', label: '2 photos' },
      { value: 'three', label: '3 photos (1 big + 2)' },
      { value: 'four', label: '4 photos (2 × 2)' },
    ],
  },
  slowZoom: { kind: 'boolean', label: 'Slow zoom', default: true },
  ...slotFields(0),
  ...slotFields(1),
  ...slotFields(2),
  ...slotFields(3),
  ...clipSoundFields,
  caption: { kind: 'text', label: 'Caption', default: '', maxLength: 80, multiline: true },
} satisfies FieldDefs;

/** 2–4 photos or clips in a collage; cells pop in one after another and (optionally) zoom in slowly. */
export const photoGridTemplate = defineTemplate({
  id: 'photo-grid',
  name: 'Photo grid',
  description: 'Two to four photos or clips in a collage.',
  defaultDurationMs: 4500,
  defaultTransition: 'fade',
  posterMs: 1400,
  fields,

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t, durationMs } = frame;
    const layout: GridLayout = LAYOUTS.includes(values.layout as GridLayout) ? (values.layout as GridLayout) : 'three';
    const cells = gridCells(layout, W, H);
    const v = values as Record<string, string | number | boolean>;
    const u = unitOf(frame);

    fillBackground(ctx, frame, theme);

    for (let i = 0; i < Math.min(SLOT_COUNT[layout], SLOTS); i += 1) {
      const cell = cells[i];
      if (!cell) continue;
      const n = i + 1;
      const enter = easeOutCubic(progress(t, 150 + i * 180, 550));
      const assetId = String(v[`media${n}`] ?? '');
      const media = assetId ? frame.media.frame(assetId, t) : undefined;

      withAlpha(ctx, enter, () => {
        isolated(ctx, () => {
          // Pop in from slightly smaller, around the cell's centre.
          const scale = lerp(0.92, 1, enter);
          const cx = cell.x + cell.width / 2;
          const cy = cell.y + cell.height / 2;
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);
          ctx.translate(-cx, -cy);
          clipRounded(ctx, cell, u * 0.03);
          if (media && (ACCEPT as readonly string[]).includes(media.kind)) {
            drawMedia(ctx, media, cell, {
              fit: v[`fit${n}`] === 'contain' ? 'contain' : 'cover',
              focusX: Number(v[`focus${n}X`]),
              focusY: Number(v[`focus${n}Y`]),
              // Each cell drifts in slowly over the whole scene (unless turned off).
              zoom: values.slowZoom ? lerp(1, 1.08, progress(t, 0, durationMs)) : 1,
              backdropTint: palette.background,
              backdropTintAlpha: 0.7,
            });
          } else {
            drawMediaPlaceholder(ctx, cell, theme, `Photo ${n}`);
          }
        });
      });
    }

    const caption = values.caption.trim();
    if (caption) {
      const body = { family: fonts.body, weight: 800 };
      const fitted = fitText(ctx, caption, {
        font: body,
        maxWidth: isLandscape(frame) ? W * 0.7 : W * 0.8,
        maxHeight: H * 0.12,
        maxSize: u * 0.065,
        minSize: u * 0.04,
        lineHeight: 1.15,
        maxLines: 2,
      });
      const enter = easeOutCubic(progress(t, 700, 500));
      const blockHeight = fitted.lines.length * fitted.lineHeightPx + u * 0.06;
      const top = H - u * 0.045 - blockHeight;
      withAlpha(ctx, enter * 0.85, () => {
        ctx.fillStyle = palette.primary;
        ctx.fillRect(u * 0.045, top, W - u * 0.09, blockHeight);
      });
      withAlpha(ctx, enter, () => {
        ctx.font = cssFont(body, fitted.sizePx);
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        fitted.lines.forEach((line, i) => ctx.fillText(line, W / 2, top + u * 0.03 + fitted.sizePx + i * fitted.lineHeightPx));
      });
    }
  },
});

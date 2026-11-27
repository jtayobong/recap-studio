import type { Project } from '../domain/project';
import { getFontPair, getPalette } from '../domain/stylePresets';
import { isolated, withAlpha, type Ctx2D, type Theme } from './context';
import { easeInCubic, easeInOutCubic, easeOutCubic, lerp } from './easing';
import { fillBackground } from './backdrop';
import { NO_MEDIA, type MediaResolver } from './media';
import { cssFont, fitText } from './text';
import { getTemplate } from './templates/registry';
import { activeTransition, getSceneSpans, locateScene, type ActiveTransition, type SceneSpan } from './timeline';

export type RenderableProject = Pick<Project, 'format' | 'style' | 'scenes'>;

export function themeFor(project: RenderableProject): Theme {
  return {
    palette: getPalette(project.style.paletteId),
    fonts: getFontPair(project.style.fontPairId),
    motion: project.style.backgroundMotion,
    shapes: project.style.backgroundShapes,
  };
}

/**
 * Draw the frame at `timeMs` in project coordinates (format.width × format.height).
 * The caller's transform is respected, so a scaled context draws a thumbnail.
 *
 * Pure and deterministic: the output depends only on (project, timeMs, media). `media` answers
 * synchronously with whatever is decoded (see render/media.ts); without it, media slots draw
 * placeholders. The preview calls this on every animation frame; the exporter (M5) will call it
 * once per output frame, after making sure that frame's media is ready.
 */
export function renderFrame(ctx: Ctx2D, project: RenderableProject, timeMs: number, media: MediaResolver = NO_MEDIA): void {
  const { width, height } = project.format;
  const theme = themeFor(project);

  ctx.save();
  // Never paint outside the frame (transitions move whole scenes; the caller's canvas may be
  // larger than one frame, e.g. a contact sheet).
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.palette.background;
  ctx.fillRect(0, 0, width, height);

  const spans = getSceneSpans(project.scenes);
  const location = locateScene(spans, timeMs);

  if (!location) {
    drawEmptyStory(ctx, width, height, theme);
    ctx.restore();
    return;
  }

  const { span, localMs } = location;
  const transition = activeTransition(location);
  const previous = span.index > 0 ? spans[span.index - 1] : undefined;
  const drawCurrent = () => drawScene(ctx, span, localMs, width, height, theme, media);
  // The first scene transitions in from the plain background.
  const drawPrevious = () =>
    previous
      ? drawScene(ctx, previous, previous.scene.durationMs, width, height, theme, media)
      : fillBackground(ctx, { width, height, localMs: 0, storyMs: 0 }, theme);

  if (transition) drawTransition(ctx, transition, width, height, theme, drawPrevious, drawCurrent);
  else drawCurrent();

  ctx.restore();
}

function drawScene(
  ctx: Ctx2D,
  span: SceneSpan,
  localMs: number,
  width: number,
  height: number,
  theme: Theme,
  media: MediaResolver,
): void {
  const template = getTemplate(span.scene.templateId);
  isolated(ctx, () => {
    // Clip so a template can never paint outside its own card (matters during slides).
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    if (!template) {
      drawMessageCard(ctx, width, height, theme, `Unknown scene type "${span.scene.templateId}"`);
      return;
    }
    try {
      template.draw(
        ctx,
        { width, height, localMs, durationMs: span.scene.durationMs, storyMs: span.startMs + localMs, media },
        span.scene.fields,
        theme,
      );
    } catch (error) {
      // A broken template shows an error card instead of crashing the preview or export.
      drawMessageCard(ctx, width, height, theme, `${template.name} scene failed to draw`);
      console.error(`Template "${template.id}" threw while rendering`, error);
    }
  });
}

const FLASH_COLOR = '#ffffff';

/**
 * Compose the outgoing and incoming scenes for an entrance transition. `progress` is linear 0→1;
 * each kind eases it. All drawing stays inside save/restore and `withAlpha` (no state leaks).
 */
export function drawTransition(
  ctx: Ctx2D,
  transition: ActiveTransition,
  width: number,
  height: number,
  theme: Theme,
  drawPrevious: () => void,
  drawCurrent: () => void,
): void {
  const p = transition.progress;
  const eased = easeInOutCubic(p);
  switch (transition.kind) {
    case 'fade':
      drawPrevious();
      withAlpha(ctx, eased, drawCurrent);
      return;

    case 'slide':
      // Vertical: the next card pushes the previous one up, like a story swipe.
      isolated(ctx, () => {
        ctx.translate(0, -height * eased);
        drawPrevious();
      });
      isolated(ctx, () => {
        ctx.translate(0, height * (1 - eased));
        drawCurrent();
      });
      return;

    case 'push':
      // Horizontal: the next card pushes the previous one to the left.
      isolated(ctx, () => {
        ctx.translate(-width * eased, 0);
        drawPrevious();
      });
      isolated(ctx, () => {
        ctx.translate(width * (1 - eased), 0);
        drawCurrent();
      });
      return;

    case 'zoom':
      // The next scene grows from the middle while it fades in.
      drawPrevious();
      withAlpha(ctx, easeOutCubic(p), () => {
        isolated(ctx, () => {
          const scale = lerp(0.6, 1, eased);
          ctx.translate(width / 2, height / 2);
          ctx.scale(scale, scale);
          ctx.translate(-width / 2, -height / 2);
          drawCurrent();
        });
      });
      return;

    case 'wipe': {
      // A diagonal edge (x + y = d) sweeps from the top-left corner to the bottom-right; the new
      // scene is revealed behind it, with an accent band riding on the edge. Built in coordinates
      // rotated by -45°, where the edge is horizontal: there x + y = √2·v.
      const band = width * 0.08;
      const d = lerp(-band * 2, width + height + band * 2, eased);
      const edge = d / Math.SQRT2;
      const far = (width + height) * 2;
      drawPrevious();
      isolated(ctx, () => {
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-far, -far, far * 2, far + edge);
        ctx.rotate(Math.PI / 4);
        ctx.clip();
        drawCurrent();
      });
      isolated(ctx, () => {
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = theme.palette.accent;
        ctx.fillRect(-far, edge - band / Math.SQRT2, far * 2, band / Math.SQRT2);
      });
      return;
    }

    case 'flash':
      // Brightens to white over the first half, cuts at the peak, fades back over the second half.
      if (p < 0.5) {
        drawPrevious();
        withAlpha(ctx, easeInCubic(p / 0.5), () => fillFrame(ctx, width, height, FLASH_COLOR));
      } else {
        drawCurrent();
        // Drops away quickly after the peak instead of lingering.
        withAlpha(ctx, easeInCubic((1 - p) / 0.5), () => fillFrame(ctx, width, height, FLASH_COLOR));
      }
      return;
  }
}

function fillFrame(ctx: Ctx2D, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

function drawEmptyStory(ctx: Ctx2D, width: number, height: number, theme: Theme): void {
  drawMessageCard(ctx, width, height, theme, 'Add a scene to start your story');
}

function drawMessageCard(ctx: Ctx2D, width: number, height: number, theme: Theme, message: string): void {
  const { palette, fonts } = theme;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = palette.surface;
  ctx.lineWidth = width * 0.01;
  ctx.setLineDash([width * 0.03, width * 0.02]);
  ctx.strokeRect(width * 0.08, height * 0.08, width * 0.84, height * 0.84);
  ctx.setLineDash([]);

  const font = { family: fonts.body, weight: 700 };
  const fitted = fitText(ctx, message, {
    font,
    maxWidth: width * 0.7,
    maxHeight: height * 0.3,
    maxSize: width * 0.06,
    minSize: width * 0.03,
    lineHeight: 1.25,
  });
  ctx.font = cssFont(font, fitted.sizePx);
  ctx.fillStyle = palette.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = height / 2 - ((fitted.lines.length - 1) * fitted.lineHeightPx) / 2;
  fitted.lines.forEach((line, i) => ctx.fillText(line, width / 2, top + i * fitted.lineHeightPx));
}

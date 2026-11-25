import type { Project } from '../domain/project';
import { getFontPair, getPalette } from '../domain/stylePresets';
import { isolated, withAlpha, type Ctx2D, type Theme } from './context';
import { easeInOutCubic } from './easing';
import { cssFont, fitText } from './text';
import { getTemplate } from './templates/registry';
import { activeTransition, getSceneSpans, locateScene, type SceneSpan } from './timeline';

export type RenderableProject = Pick<Project, 'format' | 'style' | 'scenes'>;

export function themeFor(project: RenderableProject): Theme {
  return { palette: getPalette(project.style.paletteId), fonts: getFontPair(project.style.fontPairId) };
}

/**
 * Draw the frame at `timeMs` in project coordinates (format.width × format.height).
 * The caller's transform is respected, so a scaled context draws a thumbnail.
 *
 * Pure and deterministic: the output depends only on (project, timeMs). The preview calls it
 * on every animation frame; the exporter (M5) will call it once per output frame.
 */
export function renderFrame(ctx: Ctx2D, project: RenderableProject, timeMs: number): void {
  const { width, height } = project.format;
  const theme = themeFor(project);

  ctx.save();
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

  if (transition && previous) {
    const eased = easeInOutCubic(transition.progress);
    if (transition.kind === 'fade') {
      drawScene(ctx, previous, previous.scene.durationMs, width, height, theme);
      withAlpha(ctx, eased, () => drawScene(ctx, span, localMs, width, height, theme));
    } else {
      // Vertical slide: the next card pushes the previous one up, like a story swipe.
      isolated(ctx, () => {
        ctx.translate(0, -height * eased);
        drawScene(ctx, previous, previous.scene.durationMs, width, height, theme);
      });
      isolated(ctx, () => {
        ctx.translate(0, height * (1 - eased));
        drawScene(ctx, span, localMs, width, height, theme);
      });
    }
  } else if (transition) {
    // First scene: fade in from the palette background.
    withAlpha(ctx, easeInOutCubic(transition.progress), () => drawScene(ctx, span, localMs, width, height, theme));
  } else {
    drawScene(ctx, span, localMs, width, height, theme);
  }

  ctx.restore();
}

function drawScene(ctx: Ctx2D, span: SceneSpan, localMs: number, width: number, height: number, theme: Theme): void {
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
        { width, height, localMs, durationMs: span.scene.durationMs },
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

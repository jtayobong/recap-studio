import type { BackgroundMotion, BackgroundShapes } from '../domain/project';
import type { FontPair, Palette } from '../domain/stylePresets';
import type { MediaResolver } from './media';

/** Works with an on-screen canvas (preview) and an OffscreenCanvas in a worker (export, M5). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Theme {
  palette: Palette;
  fonts: FontPair;
  /** Background motion level (M11); missing means off. */
  motion?: BackgroundMotion;
  /** Which shapes the background motion draws (M12.3); missing means geometric. */
  shapes?: BackgroundShapes;
}

/** Everything a template needs to know about the frame being drawn. */
export interface FrameInfo {
  width: number;
  height: number;
  /** Milliseconds since this scene started. */
  localMs: number;
  durationMs: number;
  /**
   * Milliseconds since the story started (for motion that runs across scenes, like the background
   * shapes). Missing means `localMs`.
   */
  storyMs?: number;
  /** Decoded media for `media` fields. May answer undefined: draw a placeholder then. */
  media: MediaResolver;
}

/**
 * Run `draw` with opacity multiplied by `alpha`.
 * Templates must use this instead of assigning ctx.globalAlpha, so that scene-level fades
 * (transitions) compose with element-level fades.
 */
export function withAlpha(ctx: Ctx2D, alpha: number, draw: () => void): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(alpha, 1);
  draw();
  ctx.restore();
}

/** Run `draw` inside save/restore so transforms and styles never leak. */
export function isolated(ctx: Ctx2D, draw: () => void): void {
  ctx.save();
  draw();
  ctx.restore();
}

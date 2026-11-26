import type { Transition } from '../../domain/project';
import type { Ctx2D, FrameInfo, Theme } from '../context';
import { resolveFields, type FieldDefs, type FieldValues } from '../fields';

/** What a template author writes. */
export interface TemplateDefinition<D extends FieldDefs> {
  id: string;
  name: string;
  description: string;
  fields: D;
  defaultDurationMs: number;
  defaultTransition: Transition;
  /** Scene-local time at which the scene looks complete (used for thumbnails and selection). */
  posterMs: number;
  /**
   * Media slots shown one after another, in order (the carousel's photos). The inspector shows how
   * long each one is on screen and can fill several of them at once.
   */
  mediaSequence?: readonly string[];
  /**
   * Draw the whole frame (including background) for scene-local time `frame.localMs`.
   * Must be pure: no Math.random, Date.now, or state kept between calls.
   * Use withAlpha() instead of assigning ctx.globalAlpha.
   */
  render(ctx: Ctx2D, frame: FrameInfo, values: FieldValues<D>, theme: Theme): void;
}

/** What the renderer and editor use: field types erased, fields resolved before drawing. */
export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  fields: FieldDefs;
  defaultDurationMs: number;
  defaultTransition: Transition;
  posterMs: number;
  mediaSequence?: readonly string[];
  draw(ctx: Ctx2D, frame: FrameInfo, rawFields: Record<string, unknown>, theme: Theme): void;
}

export function defineTemplate<D extends FieldDefs>(definition: TemplateDefinition<D>): SceneTemplate {
  const { render, ...meta } = definition;
  return {
    ...meta,
    draw(ctx, frame, rawFields, theme) {
      render(ctx, frame, resolveFields(definition.fields, rawFields), theme);
    },
  };
}

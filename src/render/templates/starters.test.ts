import { describe, expect, it, vi } from 'vitest';
import { SceneSchema } from '../../domain/project';
import { PALETTES } from '../../domain/stylePresets';
import { resolveFields } from '../fields';
import { renderFrame } from '../renderFrame';
import { createMockContext } from '../testing/mockContext';
import { getSceneSpans, totalDurationMs } from '../timeline';
import { getTemplate } from './registry';
import { getStarterStory, STARTER_STORIES } from './starters';

describe('starter stories', () => {
  it('offers Music, Travel and Fitness year', () => {
    expect(STARTER_STORIES.map((s) => s.name)).toEqual(['Music year', 'Travel year', 'Fitness year']);
    expect(getStarterStory('travel-year')?.name).toBe('Travel year');
    expect(getStarterStory('nope')).toBeUndefined();
  });

  it.each(STARTER_STORIES.map((s) => [s.name, s] as const))('%s: 6–8 valid scenes, opening with a title and closing with an outro', (_name, starter) => {
    const scenes = starter.scenes();
    expect(scenes.length).toBeGreaterThanOrEqual(6);
    expect(scenes.length).toBeLessThanOrEqual(8);
    expect(scenes[0]?.templateId).toBe('title');
    expect(scenes.at(-1)?.templateId).toBe('outro');
    for (const scene of scenes) {
      expect(SceneSchema.safeParse(scene).success, scene.templateId).toBe(true);
      const template = getTemplate(scene.templateId);
      expect(template, scene.templateId).toBeDefined();
      // Every value is one the template accepts as-is (nothing truncated, clamped or unknown).
      expect(Object.keys(scene.fields).every((key) => key in template!.fields), scene.templateId).toBe(true);
      expect(resolveFields(template!.fields, scene.fields), scene.templateId).toEqual(scene.fields);
    }
  });

  it.each(STARTER_STORIES.map((s) => [s.name, s] as const))('%s: has empty media slots to fill, and fresh scene ids each time', (_name, starter) => {
    const scenes = starter.scenes();
    const mediaSlots = scenes.flatMap((scene) =>
      Object.entries(getTemplate(scene.templateId)!.fields)
        .filter(([, def]) => def.kind === 'media')
        .map(([key]) => scene.fields[key]),
    );
    expect(mediaSlots.length).toBeGreaterThan(0);
    expect(mediaSlots.every((value) => value === '')).toBe(true);
    const again = starter.scenes();
    expect(new Set([...scenes, ...again].map((s) => s.id)).size).toBe(scenes.length * 2);
  });

  it('every starter renders at every point without error cards, in every palette', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const starter of STARTER_STORIES) {
      const scenes = starter.scenes();
      const total = totalDurationMs(getSceneSpans(scenes));
      for (const palette of PALETTES) {
        const project = { format: { width: 1080, height: 1920, fps: 30 as const }, style: { paletteId: palette.id, fontPairId: 'heavy-grotesk' }, scenes };
        for (let t = 0; t <= total; t += 500) {
          const { ctx, texts } = createMockContext();
          renderFrame(ctx, project, t);
          expect(texts().some((text) => text.includes('failed to draw'))).toBe(false);
        }
      }
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

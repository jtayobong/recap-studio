import { describe, expect, it } from 'vitest';
import type { BackgroundMotion } from '../domain/project';
import { getFontPair, getPalette } from '../domain/stylePresets';
import { backdropShapes, fillBackground, motionAmount } from './backdrop';
import type { Theme } from './context';
import { renderFrame } from './renderFrame';
import { createScene } from './templates/registry';
import { createMockContext } from './testing/mockContext';

const theme = (motion?: BackgroundMotion): Theme => ({ palette: getPalette('neon-pulse'), fonts: getFontPair('heavy-grotesk'), motion });
const frame = { width: 1080, height: 1920, localMs: 500, storyMs: 4500 };

describe('background motion', () => {
  it('off (or missing) is exactly the plain background fill', () => {
    for (const motion of ['off', undefined] as const) {
      const { ctx, calls } = createMockContext();
      fillBackground(ctx, frame, theme(motion));
      expect(calls.map((c) => c.method)).toEqual(['fillRect']);
      expect(backdropShapes(1080, 1920, 1000, theme(motion))).toEqual([]);
      expect(motionAmount(theme(motion))).toBe(0);
    }
  });

  it('lively has more shapes than subtle, and both move over time', () => {
    const subtle = backdropShapes(1080, 1920, 0, theme('subtle'));
    const lively = backdropShapes(1080, 1920, 0, theme('lively'));
    const bigger = (shapes: typeof subtle) => shapes.filter((s) => s.kind !== 'dot').length;
    expect(bigger(lively)).toBeGreaterThan(bigger(subtle));
    expect(motionAmount(theme('lively'))).toBeGreaterThan(motionAmount(theme('subtle')));
    const later = backdropShapes(1080, 1920, 2000, theme('subtle'));
    later.forEach((shape, i) => expect(Math.hypot(shape.x - subtle[i]!.x, shape.y - subtle[i]!.y)).toBeGreaterThan(1));
  });

  it('subtle also has a few single small dots; lively has none', () => {
    const dots = (level: 'subtle' | 'lively') => backdropShapes(1080, 1920, 3000, theme(level)).filter((s) => s.kind === 'dot');
    expect(dots('subtle')).toHaveLength(6);
    for (const dot of dots('subtle')) expect(dot.size).toBeLessThan(1080 * 0.012);
    expect(dots('lively')).toHaveLength(0);
  });

  it('is deterministic and moves smoothly (small steps between frames)', () => {
    expect(backdropShapes(1920, 1080, 7777, theme('lively'))).toEqual(backdropShapes(1920, 1080, 7777, theme('lively')));
    for (const level of ['subtle', 'lively'] as const) {
      const a = backdropShapes(1080, 1920, 10_000, theme(level));
      const b = backdropShapes(1080, 1920, 10_000 + 1000 / 30, theme(level));
      a.forEach((shape, i) => {
        // Ignore a shape that just wrapped round to the other side.
        const step = Math.hypot(shape.x - b[i]!.x, shape.y - b[i]!.y);
        if (step < 500) expect(step).toBeLessThan(10);
      });
    }
  });

  it('keeps shapes near the frame (they wrap round instead of drifting away)', () => {
    for (const t of [0, 60_000, 600_000]) {
      for (const shape of backdropShapes(1920, 1080, t, theme('lively'))) {
        expect(shape.x).toBeGreaterThanOrEqual(-shape.size * 2 - 1);
        expect(shape.x).toBeLessThanOrEqual(1920 + shape.size * 2 + 1);
        expect(shape.y).toBeGreaterThanOrEqual(-shape.size * 2 - 1);
        expect(shape.y).toBeLessThanOrEqual(1080 + shape.size * 2 + 1);
      }
    }
  });

  it('follows story time, so the layer carries on across a scene change', () => {
    const scenes = [createScene('title', 'a'), { ...createScene('section', 'b'), transitionIn: 'cut' as const }];
    const style = { paletteId: 'neon-pulse', fontPairId: 'heavy-grotesk', backgroundMotion: 'subtle' as const };
    const format = { width: 1080, height: 1920, fps: 30 as const };
    // Arcs drawn by the backdrop just before and just after the cut are nearly in the same place.
    const arcs = (t: number) => {
      const { ctx, calls } = createMockContext();
      renderFrame(ctx, { format, style, scenes }, t);
      return calls.filter((c) => c.method === 'translate').map((c) => c.args as number[]);
    };
    const cut = scenes[0]!.durationMs;
    const before = arcs(cut - 1);
    const after = arcs(cut);
    // The first translates are the backdrop shapes (drawn right after the background fill).
    for (let i = 0; i < 4; i += 1) {
      expect(Math.abs(before[i]![0]! - after[i]![0]!)).toBeLessThan(2);
      expect(Math.abs(before[i]![1]! - after[i]![1]!)).toBeLessThan(2);
    }
  });
});

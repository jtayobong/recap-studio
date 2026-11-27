import { describe, expect, it } from 'vitest';
import type { BackgroundMotion, BackgroundShapes } from '../domain/project';
import { getFontPair, getPalette } from '../domain/stylePresets';
import { backdropShapes, fillBackground, garlandBottom, garlandFlags, garlandStrings, garlandY, motionAmount } from './backdrop';
import type { Theme } from './context';
import { renderFrame } from './renderFrame';
import { createScene } from './templates/registry';
import { createMockContext } from './testing/mockContext';

const theme = (motion?: BackgroundMotion, shapes?: BackgroundShapes): Theme => ({
  palette: getPalette('neon-pulse'),
  fonts: getFontPair('heavy-grotesk'),
  motion,
  shapes,
});
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
    const style = { paletteId: 'neon-pulse', fontPairId: 'heavy-grotesk', backgroundMotion: 'subtle' as const, backgroundShapes: 'geometric' as const };
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

  describe('fiesta shapes (M12.3, strings of banderitas since M12.7)', () => {
    const kinds = (shapes?: BackgroundShapes, level: 'subtle' | 'lively' = 'lively') =>
      new Set(backdropShapes(1080, 1920, 5000, theme(level, shapes)).map((s) => s.kind));

    it('fiesta drifts parols, suns and stars instead of the geometric shapes', () => {
      expect(kinds('fiesta')).toEqual(new Set(['parol', 'sun', 'star']));
      expect(kinds('fiesta', 'subtle')).toEqual(new Set(['parol', 'sun', 'star', 'dot']));
      expect(kinds('geometric')).toEqual(new Set(['disc', 'ring', 'square', 'dots']));
      expect(kinds(undefined)).toEqual(kinds('geometric')); // missing = geometric
    });

    it('the parol sways gently around upright', () => {
      for (let t = 0; t < 60_000; t += 1700) {
        for (const shape of backdropShapes(1080, 1920, t, theme('lively', 'fiesta'))) {
          if (shape.kind === 'parol') expect(Math.abs(shape.rotation)).toBeLessThanOrEqual(0.14);
        }
      }
    });

    it('strings of banderitas run along the top edge: 1 for Subtle, 2 for Lively, none for Geometric or Off', () => {
      expect(garlandStrings(1080, 1920, theme('subtle', 'fiesta'))).toHaveLength(1);
      expect(garlandStrings(1080, 1920, theme('lively', 'fiesta'))).toHaveLength(2);
      expect(garlandStrings(1080, 1920, theme('lively', 'geometric'))).toEqual([]);
      expect(garlandStrings(1080, 1920, theme('off', 'fiesta'))).toEqual([]);
      // Even the flag tips stay above where templates start their titles (about 6–7 % down).
      for (const [w, h, limit] of [[1080, 1920, 0.06], [1920, 1080, 0.075]] as const) {
        for (const string of garlandStrings(w, h, theme('lively', 'fiesta'))) expect(garlandBottom(string)).toBeLessThan(h * limit);
      }
    });

    it('each string droops in scallops between posts', () => {
      const [string] = garlandStrings(1080, 1920, theme('subtle', 'fiesta'));
      expect(garlandY(string!, 0)).toBeCloseTo(string!.y); // at a post
      expect(garlandY(string!, string!.period / 2)).toBeCloseTo(string!.y + string!.sag); // the lowest point
      expect(garlandY(string!, string!.period)).toBeCloseTo(string!.y); // the next post
    });

    it('flags cover the whole width, travel along the string, and loop forever', () => {
      const t = theme('lively', 'fiesta');
      const [first, second] = garlandStrings(1080, 1920, t);
      for (const ms of [0, 12_345, 3_600_000]) {
        const flags = garlandFlags(first!, 1080, 1920, ms, t);
        expect(flags[0]!.left).toBeLessThanOrEqual(0);
        expect(flags.at(-1)!.right).toBeGreaterThan(1080 - 1080 * 0.08);
        expect(flags.length).toBeLessThan(30);
      }
      // Moving: the first string to the right, the second to the left, smoothly between frames.
      const shift = (string: typeof first, ms: number) => garlandFlags(string!, 1080, 1920, ms + 100, t)[3]!.left - garlandFlags(string!, 1080, 1920, ms, t)[3]!.left;
      expect(shift(first, 5000)).toBeGreaterThan(0);
      expect(shift(second, 5000)).toBeLessThan(0);
      expect(Math.abs(shift(first, 5000))).toBeLessThan(25);
    });

    it('flags take turns in the palette colours, and each keeps its colour as it moves', () => {
      const t = theme('subtle', 'fiesta');
      const palette = getPalette('neon-pulse');
      const [string] = garlandStrings(1080, 1920, t);
      const flags = garlandFlags(string!, 1080, 1920, 1000, t);
      expect(new Set(flags.map((f) => f.color))).toEqual(new Set([palette.primary, palette.accent, palette.text]));
      expect(flags[1]!.color).not.toBe(flags[0]!.color);
      // 1/30 s later the same flag (moved a little) has the same colour.
      const later = garlandFlags(string!, 1080, 1920, 1000 + 1000 / 30, t);
      const near = later.find((f) => Math.abs(f.left - flags[3]!.left) < 10)!;
      expect(near.color).toBe(flags[3]!.color);
    });

    it('draws the strings with plain path calls, a little clearer than the drifting shapes but soft', () => {
      const { ctx, calls } = createMockContext();
      fillBackground(ctx, frame, theme('lively', 'fiesta'));
      const methods = new Set(calls.map((c) => c.method));
      for (const m of ['lineTo', 'arc', 'fill', 'stroke', 'closePath']) expect(methods).toContain(m);
      const alphas = calls.filter((c) => c.method === 'fill').map((c) => c.state.globalAlpha);
      expect(Math.max(...alphas)).toBeCloseTo(0.5);
      expect(Math.min(...alphas)).toBeCloseTo(0.26);
    });
  });
});

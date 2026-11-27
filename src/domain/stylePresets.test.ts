import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_PAIR_ID, DEFAULT_PALETTE_ID, FONT_PAIRS, getFontPair, getPalette, PALETTES } from './stylePresets';

/** WCAG 2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('style presets', () => {
  it('has unique ids and valid colours', () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    expect(new Set(FONT_PAIRS.map((f) => f.id)).size).toBe(FONT_PAIRS.length);
    for (const palette of PALETTES) {
      for (const key of ['background', 'surface', 'primary', 'accent', 'text'] as const) {
        expect(palette[key], `${palette.id}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it.each(PALETTES.map((p) => [p.id, p] as const))('%s: text is readable on the background (WCAG AA)', (_id, palette) => {
    expect(contrast(palette.text, palette.background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PALETTES.map((p) => [p.id, p] as const))('%s: primary and accent stand out from the background', (_id, palette) => {
    expect(contrast(palette.primary, palette.background)).toBeGreaterThanOrEqual(2);
    expect(contrast(palette.accent, palette.background)).toBeGreaterThanOrEqual(2);
  });

  it('every font stack ends in a generic family, so a missing font still falls back', () => {
    for (const pair of FONT_PAIRS) {
      for (const stack of [pair.display, pair.body]) expect(stack).toMatch(/(serif|sans-serif|monospace|system-ui)$/);
    }
  });

  it('unknown ids fall back to the defaults', () => {
    expect(getPalette('nope').id).toBe(DEFAULT_PALETTE_ID);
    expect(getFontPair('nope').id).toBe(DEFAULT_FONT_PAIR_ID);
  });

  it('offers 15 palettes (10 from M7, 5 fiesta from M12.3) and 3 font pairs', () => {
    expect(PALETTES).toHaveLength(15);
    expect(FONT_PAIRS).toHaveLength(3);
  });
});

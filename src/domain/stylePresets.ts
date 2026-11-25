/**
 * Style presets. Original palettes inspired by the bold, saturated look of year-in-review
 * stories, deliberately not copying any brand's colors or typography.
 */

export interface Palette {
  id: string;
  name: string;
  background: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
}

export interface FontPair {
  id: string;
  name: string;
  /** CSS font stacks for now; self-hosted font files arrive with the renderer (M2). */
  display: string;
  body: string;
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    background: '#1a0b2e',
    surface: '#2c1650',
    primary: '#ff3d8b',
    accent: '#c6ff3d',
    text: '#fff7fb',
  },
  {
    id: 'citrus-pop',
    name: 'Citrus Pop',
    background: '#ff6b1a',
    surface: '#ff8c4a',
    primary: '#ffe14d',
    accent: '#2b1aff',
    text: '#160b00',
  },
  {
    id: 'midnight-wave',
    name: 'Midnight Wave',
    background: '#0b1d3a',
    surface: '#15305c',
    primary: '#3dd9ff',
    accent: '#ff8a3d',
    text: '#eef6ff',
  },
  {
    id: 'mint-riot',
    name: 'Mint Riot',
    background: '#d8ffe8',
    surface: '#b5f5d0',
    primary: '#ff2e63',
    accent: '#3a0ca3',
    text: '#120a1f',
  },
];

export const FONT_PAIRS: readonly FontPair[] = [
  {
    id: 'heavy-grotesk',
    name: 'Heavy Grotesk',
    display: '"Arial Black", "Helvetica Neue", system-ui, sans-serif',
    body: 'system-ui, "Segoe UI", Roboto, sans-serif',
  },
];

export const DEFAULT_PALETTE_ID = 'neon-pulse';
export const DEFAULT_FONT_PAIR_ID = 'heavy-grotesk';

/** Unknown ids fall back to the default so old or imported projects still render. */
export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? (PALETTES[0] as Palette);
}

export function getFontPair(id: string): FontPair {
  return FONT_PAIRS.find((f) => f.id === id) ?? (FONT_PAIRS[0] as FontPair);
}

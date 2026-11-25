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
  /**
   * CSS font stacks of fonts already on the computer (no font files are shipped). Each stack ends
   * in fallbacks so a missing font degrades gracefully; output can differ slightly between OSes.
   */
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
  {
    id: 'sunset-grape',
    name: 'Sunset Grape',
    background: '#2b0f3a',
    surface: '#45195c',
    primary: '#ff7a3d',
    accent: '#ffd23f',
    text: '#fff4ea',
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    background: '#ffd6ec',
    surface: '#ffb8dd',
    primary: '#7b2ff7',
    accent: '#e63900',
    text: '#2a0a2e',
  },
  {
    id: 'ocean-glass',
    name: 'Ocean Glass',
    background: '#003845',
    surface: '#0a5566',
    primary: '#2ee6c5',
    accent: '#ffcf5c',
    text: '#ebfffb',
  },
  {
    id: 'lava-lamp',
    name: 'Lava Lamp',
    background: '#b3122e',
    surface: '#cf2a45',
    primary: '#ffe066',
    accent: '#1b1b3a',
    text: '#fff8f0',
  },
  {
    id: 'mono-ink',
    name: 'Mono Ink',
    background: '#f4f1ea',
    surface: '#e2ddd2',
    primary: '#111111',
    accent: '#e8431a',
    text: '#111111',
  },
  {
    id: 'electric-night',
    name: 'Electric Night',
    background: '#07071a',
    surface: '#17173d',
    primary: '#7c5cff',
    accent: '#00e5ff',
    text: '#f5f5ff',
  },
];

export const FONT_PAIRS: readonly FontPair[] = [
  {
    id: 'heavy-grotesk',
    name: 'Heavy Grotesk',
    display: '"Arial Black", "Helvetica Neue", system-ui, sans-serif',
    body: 'system-ui, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    display: 'Georgia, "Times New Roman", "Noto Serif", "DejaVu Serif", serif',
    body: 'system-ui, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'typewriter-mono',
    name: 'Typewriter Mono',
    display: 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", "Courier New", monospace',
    body: 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", "Courier New", monospace',
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

import type { Format } from '../domain/project';

/** Export quality presets (decided with the user, see docs/NEXT-M5.md). Bitrates are for 1080×1920 @ 30 fps. */
export const QUALITY_PRESETS = {
  standard: { label: 'Standard', description: 'Good quality, reasonable size', bitsPerSecond: 8_000_000 },
  high: { label: 'High', description: 'Best quality, larger file', bitsPerSecond: 12_000_000 },
  small: { label: 'Smaller file', description: 'For sharing in chat apps', bitsPerSecond: 5_000_000 },
} as const;

export type QualityPresetId = keyof typeof QUALITY_PRESETS;
export const DEFAULT_PRESET: QualityPresetId = 'standard';

const REFERENCE_PIXELS = 1080 * 1920;
const REFERENCE_FPS = 30;

/**
 * Target bitrate for a preset at the project's format: scales with pixel count, and with the square
 * root of the frame rate (higher frame rates compress better per frame).
 */
export function bitrateFor(preset: QualityPresetId, format: Pick<Format, 'width' | 'height' | 'fps'>): number {
  const base = QUALITY_PRESETS[preset].bitsPerSecond;
  const scale = ((format.width * format.height) / REFERENCE_PIXELS) * Math.sqrt(format.fps / REFERENCE_FPS);
  return Math.round((base * scale) / 1000) * 1000;
}

/** A safe download name from the project name, e.g. "My 2026 Recap!" → "my-2026-recap.mp4". */
export function exportFilename(projectName: string, extension: string): string {
  const slug = projectName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${slug || 'recap'}.${extension}`;
}

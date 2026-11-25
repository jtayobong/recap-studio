import type { Ctx2D } from './context';

export interface FontSpec {
  family: string;
  weight: number;
}

export function cssFont({ family, weight }: FontSpec, sizePx: number): string {
  return `${weight} ${Math.max(1, Math.round(sizePx))}px ${family}`;
}

export function measureWidth(ctx: Ctx2D, text: string, font: FontSpec, sizePx: number): number {
  ctx.font = cssFont(font, sizePx);
  return ctx.measureText(text).width;
}

/** Greedy word wrap. Explicit newlines are respected; a single long word stays on its own line. */
export function wrapLines(ctx: Ctx2D, text: string, font: FontSpec, sizePx: number, maxWidth: number): string[] {
  ctx.font = cssFont(font, sizePx);
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0] as string;
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FitOptions {
  font: FontSpec;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  maxLines?: number;
}

export interface FittedText {
  sizePx: number;
  lines: string[];
  lineHeightPx: number;
}

/**
 * Largest font size (stepping down 5% at a time) at which the wrapped text fits the box.
 * Falls back to `minSize` if nothing fits, so text never disappears.
 */
export function fitText(ctx: Ctx2D, text: string, options: FitOptions): FittedText {
  const { font, maxWidth, maxHeight, maxSize, minSize, lineHeight, maxLines = Infinity } = options;
  let size = maxSize;
  for (;;) {
    const lines = wrapLines(ctx, text, font, size, maxWidth);
    const widest = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
    const fits = widest <= maxWidth && lines.length * size * lineHeight <= maxHeight && lines.length <= maxLines;
    if (fits || size <= minSize) {
      return { sizePx: Math.max(size, minSize), lines, lineHeightPx: Math.max(size, minSize) * lineHeight };
    }
    size = Math.max(minSize, size * 0.95);
  }
}

/** Single-line fit: scale the font so `text` is at most `maxWidth` wide. */
export function fitSingleLine(ctx: Ctx2D, text: string, font: FontSpec, maxWidth: number, maxSize: number, minSize: number): number {
  const width = measureWidth(ctx, text, font, maxSize);
  if (width <= maxWidth || width === 0) return maxSize;
  return Math.max(minSize, maxSize * (maxWidth / width));
}

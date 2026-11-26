/**
 * Helpers for templates that show media slots one after another (`SceneTemplate.mediaSequence`,
 * the photo carousel): what's filled, how long each item is on screen.
 */

/** Filled slots of a media sequence, in slot order. */
export function filledSlots(sequence: readonly string[], fields: Readonly<Record<string, unknown>>): string[] {
  return sequence.filter((key) => typeof fields[key] === 'string' && fields[key] !== '');
}

/** "4 photos and clips · about 1.5 s each" (or a hint when nothing is filled yet). */
export function perItemText(count: number, durationMs: number): string {
  if (count === 0) return 'Add photos or clips to fill the strip.';
  const seconds = durationMs / count / 1000;
  const each = seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(1);
  return `${count} ${count === 1 ? 'photo or clip' : 'photos and clips'} · about ${each} s each`;
}

/**
 * Put `assetIds` into the empty slots of a sequence, in slot order. Returns the field values to set
 * (empty when nothing fits) and how many of the assets didn't fit.
 */
export function fillEmptySlots(
  sequence: readonly string[],
  fields: Readonly<Record<string, unknown>>,
  assetIds: readonly string[],
): { values: Record<string, string>; leftOver: number } {
  const filled = new Set(filledSlots(sequence, fields));
  const empty = sequence.filter((key) => !filled.has(key));
  const values: Record<string, string> = {};
  assetIds.slice(0, empty.length).forEach((id, i) => {
    values[empty[i]!] = id;
  });
  return { values, leftOver: Math.max(0, assetIds.length - empty.length) };
}

/** Empty slots left in a sequence. */
export const freeSlots = (sequence: readonly string[], fields: Readonly<Record<string, unknown>>) =>
  sequence.length - filledSlots(sequence, fields).length;

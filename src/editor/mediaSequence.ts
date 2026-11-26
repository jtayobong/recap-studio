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

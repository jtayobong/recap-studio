/**
 * Animation helpers. Every animation in a template is a pure function of time,
 * so the same timestamp always produces the same frame (preview and export match).
 */

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/**
 * Linear 0→1 progress of an animation that starts at `startMs` and lasts `durationMs`,
 * measured against the scene-local time `localMs`.
 */
export function progress(localMs: number, startMs: number, durationMs: number): number {
  if (durationMs <= 0) return localMs >= startMs ? 1 : 0;
  return clamp01((localMs - startMs) / durationMs);
}

export const linear = (t: number): number => clamp01(t);

export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export const easeInCubic = (t: number): number => clamp01(t) ** 3;

export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

export const easeOutExpo = (t: number): number => {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - 2 ** (-10 * x);
};

/** Overshoots slightly past 1 before settling: good for "pop" entrances. */
export const easeOutBack = (t: number): number => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/** Deterministic pseudo-random number in [0, 1) from an integer seed (no Math.random in renders). */
export function seededRandom(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

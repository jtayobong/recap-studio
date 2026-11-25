import type { Scene, Transition } from '../domain/project';

/** Default length of a scene's entrance transition; capped at half the scene. */
export const TRANSITION_MS = 450;

export interface SceneSpan {
  scene: Scene;
  index: number;
  startMs: number;
  endMs: number;
}

export interface SceneLocation {
  span: SceneSpan;
  /** Time since the scene started, 0…durationMs. */
  localMs: number;
}

/** Lay scenes end to end. Transitions overlap the start of the incoming scene, not the timeline. */
export function getSceneSpans(scenes: readonly Scene[]): SceneSpan[] {
  const spans: SceneSpan[] = [];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    spans.push({ scene, index, startMs: cursor, endMs: cursor + scene.durationMs });
    cursor += scene.durationMs;
  });
  return spans;
}

export function totalDurationMs(spans: readonly SceneSpan[]): number {
  return spans.length === 0 ? 0 : (spans[spans.length - 1] as SceneSpan).endMs;
}

/**
 * Which scene is on screen at `timeMs`. A scene owns [startMs, endMs); the very end of the
 * story shows the last scene's final frame. Times outside the story are clamped.
 */
export function locateScene(spans: readonly SceneSpan[], timeMs: number): SceneLocation | null {
  if (spans.length === 0) return null;
  const total = totalDurationMs(spans);
  const t = Math.min(Math.max(timeMs, 0), total);

  // Binary search: stories are short, but this keeps scrubbing cheap with many scenes.
  let lo = 0;
  let hi = spans.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((spans[mid] as SceneSpan).startMs <= t) lo = mid;
    else hi = mid - 1;
  }
  const span = spans[lo] as SceneSpan;
  return { span, localMs: Math.min(t - span.startMs, span.scene.durationMs) };
}

export interface ActiveTransition {
  kind: Exclude<Transition, 'cut'>;
  /** Linear 0→1 progress through the transition. */
  progress: number;
}

/** The entrance transition in effect at this point of the scene, if any. */
export function activeTransition(location: SceneLocation): ActiveTransition | null {
  const { scene } = location.span;
  if (scene.transitionIn === 'cut') return null;
  const duration = Math.min(TRANSITION_MS, scene.durationMs / 2);
  if (location.localMs >= duration) return null;
  return { kind: scene.transitionIn, progress: location.localMs / duration };
}

export function msToFrame(ms: number, fps: number): number {
  return Math.floor((ms * fps) / 1000 + 1e-6);
}

export function frameToMs(frame: number, fps: number): number {
  return (frame * 1000) / fps;
}

/** 0:03.2 style timecode for the preview controls. */
export function formatTimecode(ms: number): string {
  const safe = Math.max(0, ms);
  const totalTenths = Math.floor(safe / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

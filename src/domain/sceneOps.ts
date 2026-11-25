import { SCENE_MAX_MS, SCENE_MIN_MS, type Scene } from './project';

/**
 * Pure, immutable operations on a scene list. Each returns a new array, or the SAME array
 * when nothing changed, so the editor can skip no-op history entries and saves.
 * Untouched scenes keep their identity, so per-scene thumbnails only redraw when needed.
 */

export function indexOfScene(scenes: Scene[], id: string): number {
  return scenes.findIndex((scene) => scene.id === id);
}

export function insertScene(scenes: Scene[], scene: Scene, index: number): Scene[] {
  const at = Math.min(Math.max(index, 0), scenes.length);
  return [...scenes.slice(0, at), scene, ...scenes.slice(at)];
}

export function removeScene(scenes: Scene[], id: string): Scene[] {
  const index = indexOfScene(scenes, id);
  if (index === -1) return scenes;
  return [...scenes.slice(0, index), ...scenes.slice(index + 1)];
}

/** Move the scene at `from` so it ends up at index `to` (in the resulting list). */
export function moveScene(scenes: Scene[], from: number, to: number): Scene[] {
  if (from < 0 || from >= scenes.length) return scenes;
  const target = Math.min(Math.max(to, 0), scenes.length - 1);
  if (target === from) return scenes;
  const next = [...scenes];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved as Scene);
  return next;
}

/** Insert a deep copy (new id) right after the original. */
export function duplicateScene(scenes: Scene[], id: string, newId: string): Scene[] {
  const index = indexOfScene(scenes, id);
  if (index === -1) return scenes;
  const original = scenes[index] as Scene;
  const copy: Scene = { ...structuredClone(original), id: newId };
  return insertScene(scenes, copy, index + 1);
}

type ScenePatch = Partial<Pick<Scene, 'durationMs' | 'transitionIn' | 'fields'>>;

export function patchScene(scenes: Scene[], id: string, patch: ScenePatch): Scene[] {
  const index = indexOfScene(scenes, id);
  if (index === -1) return scenes;
  const scene = scenes[index] as Scene;
  const changed = (Object.keys(patch) as (keyof ScenePatch)[]).some((key) => !Object.is(scene[key], patch[key]));
  if (!changed) return scenes;
  const next = [...scenes];
  next[index] = { ...scene, ...patch };
  return next;
}

export function setSceneField(scenes: Scene[], id: string, key: string, value: unknown): Scene[] {
  const scene = scenes[indexOfScene(scenes, id)];
  if (!scene || Object.is(scene.fields[key], value)) return scenes;
  return patchScene(scenes, id, { fields: { ...scene.fields, [key]: value } });
}

/** Whole milliseconds within the allowed scene length. */
export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return SCENE_MIN_MS;
  return Math.min(SCENE_MAX_MS, Math.max(SCENE_MIN_MS, Math.round(ms)));
}

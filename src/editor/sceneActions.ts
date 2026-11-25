import { clearAssetReferences } from '../domain/asset';
import { MAX_SCENES, type Scene, type Transition } from '../domain/project';
import * as ops from '../domain/sceneOps';
import { newId } from '../lib/ids';
import { usePlaybackStore } from '../preview/playbackStore';
import { createScene, createStarterScenes, posterTimeMs } from '../render/templates/registry';
import { getSceneSpans } from '../render/timeline';
import { useEditorStore } from '../store/editorStore';
import { useSelectionStore } from './selectionStore';

/**
 * Editor commands. Components call these instead of composing store updates themselves,
 * so selection, playhead and undo behave the same from buttons, keyboard and drag-and-drop.
 */

const editor = () => useEditorStore.getState();
const scenes = (): Scene[] => editor().project?.scenes ?? [];

const updateScenes = (recipe: (current: Scene[]) => Scene[], coalesceKey?: string) =>
  editor().update(
    (project) => {
      const next = recipe(project.scenes);
      return next === project.scenes ? project : { ...project, scenes: next };
    },
    coalesceKey === undefined ? undefined : { coalesceKey },
  );

/** Move the playhead to the moment the scene looks complete. */
export function showScene(id: string): void {
  const span = getSceneSpans(scenes()).find((s) => s.scene.id === id);
  if (!span) return;
  const playback = usePlaybackStore.getState();
  playback.pause();
  playback.seek(span.startMs + posterTimeMs(span.scene));
}

export function selectScene(id: string | null, options: { show?: boolean } = {}): void {
  useSelectionStore.setState({ selectedSceneId: id });
  if (id && options.show !== false) showScene(id);
}

export function canAddScene(): boolean {
  return scenes().length < MAX_SCENES;
}

/** Add a scene after the selected one (or at the end) and select it. */
export function addScene(templateId: string): void {
  if (!canAddScene()) return;
  const scene = createScene(templateId);
  const selectedIndex = ops.indexOfScene(scenes(), useSelectionStore.getState().selectedSceneId ?? '');
  const index = selectedIndex === -1 ? scenes().length : selectedIndex + 1;
  updateScenes((current) => ops.insertScene(current, scene, index));
  selectScene(scene.id);
}

export function addStarterScenes(): void {
  if (scenes().length > 0) return;
  updateScenes(() => createStarterScenes());
  selectScene(null);
  usePlaybackStore.getState().seek(0);
}

export function deleteScene(id: string): void {
  const index = ops.indexOfScene(scenes(), id);
  if (index === -1) return;
  updateScenes((current) => ops.removeScene(current, id));
  if (useSelectionStore.getState().selectedSceneId === id) {
    const remaining = scenes();
    const neighbour = remaining[index] ?? remaining[index - 1];
    selectScene(neighbour?.id ?? null);
  }
}

export function duplicateScene(id: string): void {
  if (!canAddScene()) return;
  const copyId = newId();
  updateScenes((current) => ops.duplicateScene(current, id, copyId));
  if (ops.indexOfScene(scenes(), copyId) !== -1) selectScene(copyId);
}

export function moveSceneTo(id: string, toIndex: number): void {
  const from = ops.indexOfScene(scenes(), id);
  updateScenes((current) => ops.moveScene(current, from, toIndex));
}

export function moveSceneBy(id: string, delta: number): void {
  const from = ops.indexOfScene(scenes(), id);
  if (from !== -1) moveSceneTo(id, from + delta);
}

export function setSceneField(id: string, key: string, value: unknown): void {
  updateScenes((current) => ops.setSceneField(current, id, key, value), `field:${id}:${key}`);
}

/**
 * Set several fields as one edit, e.g. a focus point's x and y. Pass a `group` name so a drag
 * (many updates in a row) becomes a single undo step.
 */
export function setSceneFields(id: string, values: Record<string, unknown>, group = Object.keys(values).join('+')): void {
  updateScenes((current) => ops.setSceneFields(current, id, values), `fields:${id}:${group}`);
}

export function setSceneDuration(id: string, durationMs: number): void {
  updateScenes(
    (current) => ops.patchScene(current, id, { durationMs: ops.clampDuration(durationMs) }),
    `duration:${id}`,
  );
}

export function setSceneTransition(id: string, transitionIn: Transition): void {
  updateScenes((current) => ops.patchScene(current, id, { transitionIn }));
}

/**
 * After an asset was deleted from the library: empty every media slot that used it.
 * Undoable like any edit (undo brings back a reference to a missing asset, shown as missing).
 */
export function forgetAsset(assetId: string): void {
  editor().update((project) => clearAssetReferences(project, assetId));
}

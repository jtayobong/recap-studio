import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../domain/project';
import { usePlaybackStore } from '../preview/playbackStore';
import { useEditorStore } from '../store/editorStore';
import {
  addScene,
  addStarterScenes,
  deleteScene,
  duplicateScene,
  moveSceneBy,
  selectScene,
  setSceneDuration,
  setSceneField,
  setSceneTransition,
} from './sceneActions';
import { useSelectionStore } from './selectionStore';

// These drive the real stores. Autosave is debounced, so nothing is written during a test.

const scenes = () => useEditorStore.getState().project?.scenes ?? [];
const templates = () => scenes().map((s) => s.templateId);
const selected = () => useSelectionStore.getState().selectedSceneId;

beforeEach(() => {
  useEditorStore.setState({ project: createProject({ name: 'Actions' }), loadState: 'ready' });
  useSelectionStore.setState({ selectedSceneId: null });
  usePlaybackStore.getState().reset();
});

describe('scene actions', () => {
  it('adds the starter story once, with nothing selected', () => {
    addStarterScenes();
    addStarterScenes();
    expect(templates()).toEqual(['title', 'big-number']);
    expect(selected()).toBeNull();
  });

  it('adds after the selected scene, selects it and shows its poster frame', () => {
    addStarterScenes();
    selectScene(scenes()[0]!.id);
    addScene('big-number');
    expect(templates()).toEqual(['title', 'big-number', 'big-number']);
    expect(selected()).toBe(scenes()[1]!.id);
    // Title is 3.5 s; Big Number's poster frame is 2.4 s into the scene.
    expect(usePlaybackStore.getState().timeMs).toBe(3500 + 2400);
  });

  it('adds at the end when nothing is selected', () => {
    addStarterScenes();
    addScene('title');
    expect(templates()).toEqual(['title', 'big-number', 'title']);
  });

  it('deleting the selected scene selects its neighbour', () => {
    addStarterScenes();
    const [first, second] = scenes();
    selectScene(first!.id);
    deleteScene(first!.id);
    expect(selected()).toBe(second!.id);
    deleteScene(second!.id);
    expect(selected()).toBeNull();
    expect(scenes()).toEqual([]);
  });

  it('duplicates and selects the copy', () => {
    addStarterScenes();
    const original = scenes()[0]!;
    setSceneField(original.id, 'title', 'Original');
    duplicateScene(original.id);
    expect(scenes()).toHaveLength(3);
    expect(scenes()[1]!.fields.title).toBe('Original');
    expect(selected()).toBe(scenes()[1]!.id);
  });

  it('moves scenes and ignores moves past the ends', () => {
    addStarterScenes();
    const title = scenes()[0]!.id;
    moveSceneBy(title, 1);
    expect(templates()).toEqual(['big-number', 'title']);
    moveSceneBy(title, 1);
    expect(templates()).toEqual(['big-number', 'title']);
  });

  it('typing into a field is a single undo step', () => {
    addStarterScenes();
    const id = scenes()[0]!.id;
    for (const text of ['H', 'He', 'Hel', 'Hello']) setSceneField(id, 'title', text);
    expect(scenes()[0]!.fields.title).toBe('Hello');
    useEditorStore.getState().undo();
    expect(scenes()[0]!.fields.title).toBe('My 2026\nRecap'); // the template default
  });

  it('clamps durations and sets transitions', () => {
    addStarterScenes();
    const id = scenes()[0]!.id;
    setSceneDuration(id, 10);
    expect(scenes()[0]!.durationMs).toBe(250);
    setSceneDuration(id, 4200.4);
    expect(scenes()[0]!.durationMs).toBe(4200);
    setSceneTransition(id, 'slide');
    expect(scenes()[0]!.transitionIn).toBe('slide');
  });
});

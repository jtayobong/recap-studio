import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../domain/project';
import { useEditorStore } from '../store/editorStore';
import { clearMusic, setMusic, updateMusic } from './musicActions';

// Drives the real editor store; autosave is debounced, so nothing is written during a test.

const audio = () => useEditorStore.getState().project?.audio;
const undo = () => useEditorStore.getState().undo();

beforeEach(() => {
  useEditorStore.setState({ project: createProject({ name: 'Music' }), loadState: 'ready' });
});

describe('music actions', () => {
  it('sets the scene the music starts with, and clears it with an empty value or an unknown scene (M12.4)', () => {
    const project = useEditorStore.getState().project!;
    const scenes = [
      { id: 's1', templateId: 'title', durationMs: 3000, fields: {}, transitionIn: 'cut' as const },
      { id: 's2', templateId: 'title', durationMs: 3000, fields: {}, transitionIn: 'cut' as const },
    ];
    useEditorStore.setState({ project: { ...project, scenes } });
    setMusic('song-a');
    updateMusic({ startSceneId: 's2' });
    expect(audio()?.startSceneId).toBe('s2');
    undo();
    expect(audio()?.startSceneId).toBeUndefined();
    updateMusic({ startSceneId: 's2' });
    updateMusic({ startSceneId: '' });
    expect(audio()).not.toHaveProperty('startSceneId');
    updateMusic({ startSceneId: 'nope' });
    expect(audio()).not.toHaveProperty('startSceneId');
  });

  it('adds a track with defaults: start of the song, full volume, fade out only', () => {
    setMusic('song-a');
    expect(audio()).toEqual({ assetId: 'song-a', offsetMs: 0, volume: 1, fadeIn: false, fadeOut: true });
  });

  it('a different song restarts from 0 but keeps volume and fades', () => {
    setMusic('song-a');
    updateMusic({ offsetMs: 45_000, volume: 0.5, fadeIn: true });
    setMusic('song-b');
    expect(audio()).toEqual({ assetId: 'song-b', offsetMs: 0, volume: 0.5, fadeIn: true, fadeOut: true });
  });

  it('choosing the same song again changes nothing (no history entry)', () => {
    setMusic('song-a');
    const project = useEditorStore.getState().project;
    setMusic('song-a');
    expect(useEditorStore.getState().project).toBe(project);
  });

  it('clamps and rounds settings', () => {
    setMusic('song-a');
    updateMusic({ offsetMs: -5, volume: 1.7 });
    expect(audio()).toMatchObject({ offsetMs: 0, volume: 1 });
    updateMusic({ offsetMs: 1234.6, volume: 0.333 });
    expect(audio()).toMatchObject({ offsetMs: 1235, volume: 0.33 });
  });

  it('a slider drag is one undo step', () => {
    setMusic('song-a');
    for (const v of [0.9, 0.7, 0.5, 0.3]) updateMusic({ volume: v }, 'music:volume');
    expect(audio()?.volume).toBe(0.3);
    undo();
    expect(audio()?.volume).toBe(1);
  });

  it('clear removes the track, and undo brings it back', () => {
    setMusic('song-a');
    updateMusic({ offsetMs: 30_000 });
    clearMusic();
    expect(audio()).toBeUndefined();
    expect('audio' in useEditorStore.getState().project!).toBe(false);
    undo();
    expect(audio()).toMatchObject({ assetId: 'song-a', offsetMs: 30_000 });
  });

  it('settings without a track do nothing', () => {
    const project = useEditorStore.getState().project;
    updateMusic({ volume: 0.5 });
    clearMusic();
    expect(useEditorStore.getState().project).toBe(project);
  });
});

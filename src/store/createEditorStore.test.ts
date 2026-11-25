import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, type Project } from '../domain/project';
import { createEditorStore, HISTORY_LIMIT } from './createEditorStore';

function fakeRepository(initial: Project) {
  let stored = initial;
  let failNext = false;
  const saves: Project[] = [];
  let clock = 10_000;

  return {
    saves,
    failNextSave: () => {
      failNext = true;
    },
    get: vi.fn(async (id: string) => (id === stored.id ? stored : undefined)),
    save: vi.fn(async (project: Project) => {
      if (failNext) {
        failNext = false;
        throw new Error('Disk full');
      }
      clock += 1;
      stored = { ...project, updatedAt: clock };
      saves.push(stored);
      return stored;
    }),
  };
}

describe('editor store', () => {
  let repo: ReturnType<typeof fakeRepository>;
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = fakeRepository(createProject({ name: 'Start' }, { now: 1, id: 'p1' }));
    store = createEditorStore(repo, { autosaveMs: 500 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const rename = (name: string) => store.getState().update((p) => ({ ...p, name }));

  it('loads a project', async () => {
    await store.getState().load('p1');
    expect(store.getState().loadState).toBe('ready');
    expect(store.getState().project?.name).toBe('Start');
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('reports missing projects', async () => {
    await store.getState().load('nope');
    expect(store.getState().loadState).toBe('not-found');
  });

  it('debounces edits into a single save of the latest state', async () => {
    await store.getState().load('p1');
    rename('One');
    rename('Two');
    expect(store.getState().saveStatus).toBe('unsaved');

    await vi.advanceTimersByTimeAsync(499);
    expect(repo.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await store.getState().flushSave();
    expect(repo.saves.map((p) => p.name)).toEqual(['Two']);
    expect(store.getState().saveStatus).toBe('saved');
    expect(store.getState().lastSavedAt).toBe(10_001);
  });

  it('ignores no-op updates', async () => {
    await store.getState().load('p1');
    store.getState().update((p) => p);
    expect(store.getState().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('flushSave writes immediately', async () => {
    await store.getState().load('p1');
    rename('Now');
    await store.getState().flushSave();
    expect(repo.saves.map((p) => p.name)).toEqual(['Now']);
  });

  it('surfaces save errors and retries on flush', async () => {
    await store.getState().load('p1');
    repo.failNextSave();
    rename('Will fail');
    await store.getState().flushSave();
    expect(store.getState().saveStatus).toBe('error');
    expect(store.getState().saveError).toBe('Disk full');

    await store.getState().flushSave();
    expect(store.getState().saveStatus).toBe('saved');
    expect(repo.saves.map((p) => p.name)).toEqual(['Will fail']);
  });

  it('keeps "unsaved" when an edit lands during a save', async () => {
    await store.getState().load('p1');
    rename('First');
    const firstSave = store.getState().flushSave(); // not awaited yet
    await Promise.resolve(); // let the queued save start
    expect(store.getState().saveStatus).toBe('saving');

    rename('Second'); // arrives while "First" is in flight
    await firstSave;
    expect(store.getState().saveStatus).toBe('unsaved');

    await store.getState().flushSave();
    expect(repo.saves.map((p) => p.name)).toEqual(['First', 'Second']);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('close() flushes pending changes and unloads', async () => {
    await store.getState().load('p1');
    rename('Before close');
    await store.getState().close();
    expect(repo.saves.map((p) => p.name)).toEqual(['Before close']);
    expect(store.getState().project).toBeNull();
    expect(store.getState().loadState).toBe('idle');
  });
});

describe('editor store history', () => {
  let clock: number;
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    clock = 0;
    const repo = fakeRepository(createProject({ name: 'Start' }, { now: 1, id: 'p1' }));
    store = createEditorStore(repo, { autosaveMs: 500, now: () => clock });
    await store.getState().load('p1');
  });

  const rename = (name: string, coalesceKey?: string) =>
    store.getState().update((p) => ({ ...p, name }), coalesceKey ? { coalesceKey } : undefined);
  const name = () => store.getState().project?.name;

  it('undoes and redoes each edit', () => {
    expect(store.getState().canUndo).toBe(false);
    rename('A');
    rename('B');
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(name()).toBe('A');
    store.getState().undo();
    expect(name()).toBe('Start');
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);

    store.getState().redo();
    store.getState().redo();
    expect(name()).toBe('B');
    expect(store.getState().canRedo).toBe(false);
  });

  it('a new edit clears the redo stack', () => {
    rename('A');
    store.getState().undo();
    rename('C');
    expect(store.getState().canRedo).toBe(false);
    store.getState().redo();
    expect(name()).toBe('C');
  });

  it('coalesces rapid edits with the same key into one undo step', () => {
    rename('H', 'field:title');
    clock += 200;
    rename('He', 'field:title');
    clock += 200;
    rename('Hey', 'field:title');
    store.getState().undo();
    expect(name()).toBe('Start');
  });

  it('starts a new step after a pause or a different key', () => {
    rename('H', 'field:title');
    clock += 1500;
    rename('Hi', 'field:title');
    rename('Hi!', 'field:subtitle');
    store.getState().undo();
    expect(name()).toBe('Hi');
    store.getState().undo();
    expect(name()).toBe('H');
  });

  it('does not record no-op updates', () => {
    store.getState().update((p) => p);
    expect(store.getState().canUndo).toBe(false);
  });

  it('undo marks the project unsaved and autosaves it', async () => {
    rename('A');
    await store.getState().flushSave();
    store.getState().undo();
    expect(store.getState().saveStatus).toBe('unsaved');
    await store.getState().flushSave();
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('caps history length', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) rename(`v${i}`);
    let steps = 0;
    while (store.getState().canUndo) {
      store.getState().undo();
      steps += 1;
    }
    expect(steps).toBe(HISTORY_LIMIT);
  });

  it('loading another project clears history', async () => {
    rename('A');
    await store.getState().load('p1');
    expect(store.getState().canUndo).toBe(false);
  });
});

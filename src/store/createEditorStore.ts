import { create } from 'zustand';
import type { ProjectRepository } from '../db/projectRepository';
import type { Project } from '../domain/project';
import { debounce } from '../lib/debounce';
import { describeError } from '../lib/errors';

export type LoadState = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export interface UpdateOptions {
  /**
   * Consecutive edits with the same key, less than a second apart, become ONE undo step.
   * Use it for continuous input such as typing in a field: `field:<sceneId>:<name>`.
   */
  coalesceKey?: string;
}

export interface EditorState {
  projectId: string | null;
  project: Project | null;
  loadState: LoadState;
  loadError: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;

  load(id: string): Promise<void>;
  /** Apply an immutable change. Return the same object to signal "no change". */
  update(recipe: (project: Project) => Project, options?: UpdateOptions): void;
  undo(): void;
  redo(): void;
  /** Write any pending change now and wait for all saves to finish. Retries after an error. */
  flushSave(): Promise<void>;
  /** Flush, then unload the project. */
  close(): Promise<void>;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_WINDOW_MS = 1000;

const UNLOADED = {
  projectId: null,
  project: null,
  loadState: 'idle',
  loadError: null,
  saveStatus: 'saved',
  saveError: null,
  lastSavedAt: null,
  canUndo: false,
  canRedo: false,
} as const satisfies Partial<EditorState>;

/**
 * Editor state, autosave and undo/redo.
 *
 * - Edits update memory immediately and schedule a debounced save.
 * - Saves are serialized through a promise chain, so writes never race or land out of order.
 * - A save only marks the state "saved" if no newer edit arrived while it was running.
 * - History stores whole project snapshots. They are immutable and share unchanged parts,
 *   so this is cheap, and undo can never get out of sync with the document.
 */
export function createEditorStore(
  repository: Pick<ProjectRepository, 'get' | 'save'>,
  options: { autosaveMs?: number; now?: () => number } = {},
) {
  const autosaveMs = options.autosaveMs ?? 500;
  const now = options.now ?? Date.now;

  return create<EditorState>()((set, get) => {
    let saveChain: Promise<void> = Promise.resolve();
    let past: Project[] = [];
    let future: Project[] = [];
    let lastEdit: { key: string; at: number } | null = null;

    const resetHistory = () => {
      past = [];
      future = [];
      lastEdit = null;
    };

    const persist = async (): Promise<void> => {
      const snapshot = get().project;
      if (!snapshot) return;
      set({ saveStatus: 'saving', saveError: null });
      try {
        const saved = await repository.save(snapshot);
        if (get().project === snapshot) {
          set({ saveStatus: 'saved', lastSavedAt: saved.updatedAt });
        }
      } catch (error) {
        if (get().project === snapshot) {
          set({ saveStatus: 'error', saveError: describeError(error) });
        }
      }
    };

    const enqueueSave = (): Promise<void> => {
      saveChain = saveChain.then(persist);
      return saveChain;
    };

    const scheduleSave = debounce(() => {
      void enqueueSave();
    }, autosaveMs);

    /** Swap in a project from history and save it. */
    const restore = (project: Project) => {
      lastEdit = null;
      set({ project, saveStatus: 'unsaved', canUndo: past.length > 0, canRedo: future.length > 0 });
      scheduleSave();
    };

    return {
      ...UNLOADED,

      async load(id) {
        await get().close();
        resetHistory();
        set({ ...UNLOADED, projectId: id, loadState: 'loading' });
        try {
          const project = await repository.get(id);
          if (get().projectId !== id) return; // a newer load() won
          if (!project) {
            set({ loadState: 'not-found' });
            return;
          }
          set({ project, loadState: 'ready', lastSavedAt: project.updatedAt });
        } catch (error) {
          if (get().projectId !== id) return;
          set({ loadState: 'error', loadError: describeError(error) });
        }
      },

      update(recipe, updateOptions) {
        const current = get().project;
        if (!current) return;
        const next = recipe(current);
        if (next === current) return;

        const key = updateOptions?.coalesceKey;
        const at = now();
        const coalesce = key !== undefined && lastEdit?.key === key && at - lastEdit.at < COALESCE_WINDOW_MS;
        if (!coalesce) {
          past.push(current);
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        future = [];
        lastEdit = key === undefined ? null : { key, at };

        set({ project: next, saveStatus: 'unsaved', canUndo: past.length > 0, canRedo: false });
        scheduleSave();
      },

      undo() {
        const current = get().project;
        const previous = past.pop();
        if (!current || !previous) return;
        future.push(current);
        restore(previous);
      },

      redo() {
        const current = get().project;
        const next = future.pop();
        if (!current || !next) return;
        past.push(current);
        restore(next);
      },

      async flushSave() {
        if (scheduleSave.pending()) {
          scheduleSave.flush();
        } else if (get().saveStatus === 'error') {
          void enqueueSave();
        }
        await saveChain;
      },

      async close() {
        const closingId = get().projectId;
        await get().flushSave();
        // Only reset if nothing else was loaded in the meantime.
        if (get().projectId === closingId) {
          scheduleSave.cancel();
          resetHistory();
          set({ ...UNLOADED });
        }
      },
    };
  });
}

export type EditorStore = ReturnType<typeof createEditorStore>;

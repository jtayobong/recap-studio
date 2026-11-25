import { create } from 'zustand';
import type { Project } from '../domain/project';
import { describeError } from '../lib/errors';
import type { exportStory, ExportAssetSource, ExportedFile } from './exportStory';
import type { QualityPresetId } from './presets';

/**
 * Export UI state. UI-only (like playback): never saved, never in undo history.
 * The running export works on a snapshot, so editing can continue meanwhile.
 */
export type ExportState =
  | { status: 'idle'; notice?: string }
  | { status: 'exporting'; projectId: string; fraction: number; startedAt: number }
  | { status: 'done'; projectId: string; file: ExportedFile; url: string; downloaded: boolean }
  | { status: 'error'; projectId: string; message: string; preset: QualityPresetId };

interface ExportStore {
  state: ExportState;
  start(project: Project, preset: QualityPresetId): Promise<void>;
  cancel(): void;
  /** Back to idle; frees the finished file. */
  dismiss(): void;
  /** The user clicked Download (leaving the editor no longer needs a warning). */
  markDownloaded(): void;
}

export function createExportStore(
  source: ExportAssetSource,
  deps: {
    run?: typeof exportStory;
    now?: () => number;
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  } = {},
) {
  // Lazy: Mediabunny and the worker code load only when someone actually exports.
  const run: typeof exportStory = deps.run ?? (async (...args) => (await import('./exportStory')).exportStory(...args));
  const now = deps.now ?? Date.now;
  const createUrl = deps.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  let controller: AbortController | null = null;

  return create<ExportStore>()((set, get) => {
    const release = () => {
      const { state } = get();
      if (state.status === 'done') revokeUrl(state.url);
    };

    return {
      state: { status: 'idle' },

      async start(project, preset) {
        if (get().state.status === 'exporting') return;
        release();
        const current = new AbortController();
        controller = current;
        set({ state: { status: 'exporting', projectId: project.id, fraction: 0, startedAt: now() } });
        let lastPercent = -1;
        try {
          const file = await run(project, source, {
            preset,
            signal: current.signal,
            onProgress: (fraction) => {
              const percent = Math.floor(fraction * 100);
              if (percent === lastPercent || controller !== current) return;
              lastPercent = percent;
              const { state } = get();
              if (state.status === 'exporting') set({ state: { ...state, fraction } });
            },
          });
          if (controller !== current) return; // cancelled/replaced meanwhile
          set({ state: { status: 'done', projectId: project.id, file, url: createUrl(file.blob), downloaded: false } });
        } catch (error) {
          if (controller !== current) return;
          const cancelled = error instanceof DOMException && error.name === 'AbortError';
          set({
            state: cancelled
              ? { status: 'idle', notice: 'Export cancelled.' }
              : { status: 'error', projectId: project.id, message: describeError(error), preset },
          });
        } finally {
          if (controller === current) controller = null;
        }
      },

      cancel() {
        if (get().state.status !== 'exporting') return;
        controller?.abort();
        controller = null;
        set({ state: { status: 'idle', notice: 'Export cancelled.' } });
      },

      markDownloaded() {
        const { state } = get();
        if (state.status === 'done' && !state.downloaded) set({ state: { ...state, downloaded: true } });
      },

      dismiss() {
        if (get().state.status === 'exporting') return;
        release();
        set({ state: { status: 'idle' } });
      },
    };
  });
}

export type ExportStoreHook = ReturnType<typeof createExportStore>;

/** Whether leaving the editor would lose work: an export running, or a file not yet downloaded. */
export function exportWouldBeLost(state: ExportState): boolean {
  return state.status === 'exporting' || (state.status === 'done' && !state.downloaded);
}

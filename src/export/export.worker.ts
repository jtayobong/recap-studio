/// <reference lib="webworker" />
import { encodeStory, type EncodeOptions } from './encodeStory';

/**
 * Export worker. Protocol (spike version):
 *   → { type: 'start', options }   (options without signal/onProgress/media)
 *   → { type: 'cancel' }
 *   ← { type: 'progress', frame, totalFrames }
 *   ← { type: 'done', result }     (result.data is transferred, not copied)
 *   ← { type: 'error', message, cancelled }
 */

export type WorkerEncodeOptions = Omit<EncodeOptions, 'signal' | 'onProgress' | 'media'>;

export type ExportRequest = { type: 'start'; options: WorkerEncodeOptions } | { type: 'cancel' };

export type ExportResponse =
  | { type: 'progress'; frame: number; totalFrames: number }
  | { type: 'done'; result: Awaited<ReturnType<typeof encodeStory>> }
  | { type: 'error'; message: string; cancelled: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let controller: AbortController | null = null;
let lastProgressAt = 0;

const post = (message: ExportResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    controller?.abort(new DOMException('Export cancelled', 'AbortError'));
    return;
  }
  if (controller) return; // one export per worker at a time
  controller = new AbortController();
  try {
    const result = await encodeStory({
      ...request.options,
      signal: controller.signal,
      onProgress: ({ frame, totalFrames }) => {
        // Throttle progress messages to ~10 per second (plus the last frame).
        const now = performance.now();
        if (frame === totalFrames || now - lastProgressAt > 100) {
          lastProgressAt = now;
          post({ type: 'progress', frame, totalFrames });
        }
      },
    });
    post({ type: 'done', result }, [result.data]);
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === 'AbortError';
    post({ type: 'error', message: error instanceof Error ? error.message : String(error), cancelled });
  } finally {
    controller = null;
  }
};

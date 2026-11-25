/// <reference lib="webworker" />
import { encodeStory, type EncodeOptions, type EncodeResult } from './encodeStory';
import { createExportMedia, type ExportAsset } from './exportMedia';
import { MediabunnyVideoReader } from './videoReader';

/**
 * Export worker: renders and encodes off the main thread, so the editor stays responsive.
 *
 *   → { type: 'start', options, assets }  options: the encode settings and a snapshot of the project;
 *                                          assets: asset id → { kind, file } (Blobs pass by reference)
 *   → { type: 'cancel' }
 *   ← { type: 'progress', frame, totalFrames }   (throttled to ~10/s, plus the last frame)
 *   ← { type: 'done', result }                    (result.data is transferred, not copied)
 *   ← { type: 'error', message, cancelled }
 */

export type WorkerEncodeOptions = Omit<EncodeOptions, 'signal' | 'onProgress' | 'media'>;

export type ExportRequest =
  | { type: 'start'; options: WorkerEncodeOptions; assets: Record<string, ExportAsset> }
  | { type: 'cancel' };

export type ExportResponse =
  | { type: 'progress'; frame: number; totalFrames: number }
  | { type: 'done'; result: EncodeResult }
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
    // Fonts: the app uses system font stacks, which need no loading. Don't await
    // `self.fonts.ready` here: in a dedicated worker it never resolved (Chromium, M5 step 2).
    // Self-hosted fonts must be added with `new FontFace(...)` and an explicit `await face.load()`.
    const media = createExportMedia(request.assets, {
      decodeImage: async (file) => {
        const bitmap = await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      },
      openVideo: (file, timestampsS) => MediabunnyVideoReader.open(file, timestampsS),
    });
    const result = await encodeStory({
      ...request.options,
      media,
      signal: controller.signal,
      onProgress: ({ frame, totalFrames }) => {
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

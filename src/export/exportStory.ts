import type { Asset } from '../domain/asset';
import type { Project } from '../domain/project';
import type { EncodeResult } from './encodeStory';
import type { ExportAsset } from './exportMedia';
import type { ExportRequest, ExportResponse, WorkerEncodeOptions } from './export.worker';
import { mediaAssetIds } from './mediaRefs';
import { bitrateFor, DEFAULT_PRESET, exportFilename, type ExportFps, type QualityPresetId } from './presets';
import { fullCodecStringFor, pickTarget, type ExportTarget } from './target';
import { exportWorkerScriptUrl } from './workerUrl';

export { mediaAssetIds } from './mediaRefs';

/**
 * Main-thread export API. Takes a snapshot of the project (later edits don't affect a running
 * export), gathers the media files it uses, and runs the encode in a dedicated worker.
 */

export interface ExportAssetSource {
  get(id: string): Promise<Asset | undefined>;
  readFile(id: string): Promise<Blob | undefined>;
}

export interface ExportStoryOptions {
  preset?: QualityPresetId;
  /** Output frame rate (D35); default: the project's `format.fps`. The project itself is not changed. */
  fps?: ExportFps;
  /** Force a format (tests); by default the best encodable one is chosen. */
  target?: ExportTarget;
  /** Export only up to this time (tests and previews). */
  endMs?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportedFile {
  blob: Blob;
  filename: string;
  target: ExportTarget;
  bitrate: number;
  fps: number;
  totalFrames: number;
  elapsedMs: number;
  /** Where the export's time went (ms), for diagnostics. */
  timings: { draw: number; prepare: number; encode: number; audio: number };
  /** Media that couldn't be drawn (shown as placeholders): asset id → reason. */
  mediaFailures: Record<string, string>;
  /** Whether the story's music is in the file, and why not if it was left out. */
  music: { included: boolean; note?: string };
}

export class ExportUnsupportedError extends Error {
  constructor() {
    super('This browser can’t encode video (no H.264 or VP9 encoder). Try a recent Chrome or Edge.');
    this.name = 'ExportUnsupportedError';
  }
}

/** Read the rows and files of the assets a project uses. Missing ones are simply left out. */
export async function gatherExportAssets(project: Project, source: ExportAssetSource): Promise<Record<string, ExportAsset>> {
  const assets: Record<string, ExportAsset> = {};
  for (const id of mediaAssetIds(project)) {
    const [asset, file] = await Promise.all([source.get(id), source.readFile(id)]);
    // Only this project's own assets (projects never share media, see D15).
    if (asset && file && asset.projectId === project.id) assets[id] = { kind: asset.kind, file, durationMs: asset.durationMs };
  }
  return assets;
}

export function runExportWorker(
  options: WorkerEncodeOptions,
  assets: Record<string, ExportAsset>,
  onProgress?: (frame: number, totalFrames: number) => void,
  signal?: AbortSignal,
): Promise<EncodeResult> {
  if (signal?.aborted) return Promise.reject(new DOMException('Export cancelled', 'AbortError'));
  const worker = new Worker(exportWorkerScriptUrl(), { type: 'module', name: 'export' });
  return new Promise<EncodeResult>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => worker.postMessage({ type: 'cancel' } satisfies ExportRequest);
    signal?.addEventListener('abort', onAbort);
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.frame, message.totalFrames);
        return;
      }
      finish();
      if (message.type === 'done') resolve(message.result);
      else reject(message.cancelled ? new DOMException(message.message, 'AbortError') : new Error(message.message));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'The export worker failed to start.'));
    };
    worker.postMessage({ type: 'start', options, assets } satisfies ExportRequest);
  });
}

export async function exportStory(project: Project, source: ExportAssetSource, options: ExportStoryOptions = {}): Promise<ExportedFile> {
  const snapshot = structuredClone(project);
  // The renderer is time-based, so a different output frame rate is just a different format.
  const format = { ...snapshot.format, fps: options.fps ?? snapshot.format.fps };
  const { width, height, fps } = format;
  const bitrate = bitrateFor(options.preset ?? DEFAULT_PRESET, format);
  const target = options.target ?? (await pickTarget(width, height, bitrate, fps));
  if (!target) throw new ExportUnsupportedError();

  const assets = await gatherExportAssets(snapshot, source);
  const result = await runExportWorker(
    {
      project: { format, style: snapshot.style, scenes: snapshot.scenes },
      container: target.container,
      codec: target.codec,
      fullCodecString: fullCodecStringFor(target.codec, width, height, fps, bitrate),
      bitrate,
      endMs: options.endMs,
      music: snapshot.audio,
    },
    assets,
    (frame, total) => options.onProgress?.(total > 0 ? frame / total : 1),
    options.signal,
  );

  // Assets referenced but not found at all never reached the worker; report them too.
  // (The music is reported separately, in `music.note`.)
  const mediaFailures = { ...result.mediaFailures };
  for (const id of mediaAssetIds({ scenes: snapshot.scenes })) {
    if (!assets[id] && !mediaFailures[id]) mediaFailures[id] = 'missing from the library';
  }

  return {
    blob: new Blob([result.data], { type: target.mimeType }),
    filename: exportFilename(snapshot.name, target.extension),
    target,
    bitrate,
    fps,
    totalFrames: result.totalFrames,
    elapsedMs: result.totalMs,
    timings: { draw: result.drawMs, prepare: result.prepareMs, encode: result.encodeMs, audio: result.audioMs },
    mediaFailures,
    music: result.music,
  };
}

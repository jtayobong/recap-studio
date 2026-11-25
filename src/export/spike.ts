import { ALL_FORMATS, BlobSource, canEncodeVideo, CanvasSink, Input, Quality, type VideoCodec } from 'mediabunny';
import { renderFrame, type RenderableProject } from '../render/renderFrame';
import { encodeStory, type EncodeResult, type ExportContainer } from './encodeStory';
import type { ExportRequest, ExportResponse, WorkerEncodeOptions } from './export.worker';

/**
 * M5 spike harness: export a story in a worker (or on the main thread) and report timings.
 * Loaded by `e2e/export-spike.spec.ts`; not part of the app UI. Kept small so its pieces can grow
 * into the real exporter.
 */

export interface SpikeTarget {
  container: ExportContainer;
  codec: VideoCodec;
}

/** The format the app would export: H.264 in MP4 if encodable, else VP9 in WebM. */
export async function pickTarget(width: number, height: number, bitrate: number): Promise<SpikeTarget | null> {
  const options = { width, height, quality: new Quality({ bitrate }) };
  if (await canEncodeVideo('avc', options)) return { container: 'mp4', codec: 'avc' };
  if (await canEncodeVideo('vp9', options)) return { container: 'webm', codec: 'vp9' };
  return null;
}

export function encodeInWorker(
  options: WorkerEncodeOptions,
  onProgress?: (frame: number, totalFrames: number) => void,
  signal?: AbortSignal,
): Promise<EncodeResult> {
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<EncodeResult>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => worker.postMessage({ type: 'cancel' } satisfies ExportRequest);
    signal?.addEventListener('abort', onAbort);
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const message = event.data;
      if (message.type === 'progress') onProgress?.(message.frame, message.totalFrames);
      else if (message.type === 'done') {
        finish();
        resolve(message.result);
      } else {
        finish();
        reject(message.cancelled ? new DOMException(message.message, 'AbortError') : new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'The export worker failed to start.'));
    };
    worker.postMessage({ type: 'start', options } satisfies ExportRequest);
  });
}

export function encodeOnMainThread(options: WorkerEncodeOptions): Promise<EncodeResult> {
  return encodeStory(options);
}

export interface VideoReport {
  codec: string | null;
  width: number;
  height: number;
  durationS: number;
  packetCount: number;
  /**
   * Per compared frame: mean absolute difference per channel (0–255) between the decoded frame and
   * renderFrame, and the share of pixels whose largest channel difference exceeds 48 (catches
   * localized problems such as a missing font that a mean would hide).
   */
  frameDiffs: { timeMs: number; meanAbsDiff: number; badPixelShare: number }[];
}

/**
 * Decode an exported file and compare frames against `renderFrame` at the same timestamps.
 * Small differences are expected from lossy encoding and YUV conversion.
 */
export async function inspectExport(data: ArrayBuffer, mimeType: string, project: RenderableProject, timesMs: number[]): Promise<VideoReport> {
  const input = new Input({ source: new BlobSource(new Blob([data], { type: mimeType })), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No video track in the export.');
    const stats = await track.computePacketStats();
    const sink = new CanvasSink(track, { poolSize: 1 });
    const { width, height, fps } = project.format;
    const reference = new OffscreenCanvas(width, height);
    const refCtx = reference.getContext('2d', { alpha: false, willReadFrequently: true })!;
    const decodedCanvas = new OffscreenCanvas(width, height);
    const decodedCtx = decodedCanvas.getContext('2d', { willReadFrequently: true })!;

    const frameDiffs: VideoReport['frameDiffs'] = [];
    for (const timeMs of timesMs) {
      // Middle of the frame, so rounding never picks the neighbour.
      const wrapped = await sink.getCanvas(timeMs / 1000 + 0.5 / fps);
      if (!wrapped) throw new Error(`No frame at ${timeMs} ms`);
      decodedCtx.drawImage(wrapped.canvas, 0, 0, width, height);
      renderFrame(refCtx, project, timeMs);
      const a = decodedCtx.getImageData(0, 0, width, height).data;
      const b = refCtx.getImageData(0, 0, width, height).data;
      let sum = 0;
      let bad = 0;
      for (let i = 0; i < a.length; i += 4) {
        const dr = Math.abs(a[i]! - b[i]!);
        const dg = Math.abs(a[i + 1]! - b[i + 1]!);
        const db = Math.abs(a[i + 2]! - b[i + 2]!);
        sum += dr + dg + db;
        if (Math.max(dr, dg, db) > 48) bad += 1;
      }
      const pixels = a.length / 4;
      frameDiffs.push({ timeMs, meanAbsDiff: sum / (pixels * 3), badPixelShare: bad / pixels });
    }
    return {
      codec: track.codec,
      width: track.displayWidth,
      height: track.displayHeight,
      durationS: await input.computeDuration(),
      packetCount: stats.packetCount,
      frameDiffs,
    };
  } finally {
    input.dispose();
  }
}

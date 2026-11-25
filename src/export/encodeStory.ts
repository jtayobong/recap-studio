import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  type VideoCodec,
} from 'mediabunny';
import { NO_MEDIA, type MediaResolver } from '../render/media';
import { renderFrame, type RenderableProject } from '../render/renderFrame';
import { frameToMs, getSceneSpans, totalDurationMs } from '../render/timeline';

/**
 * The export frame loop: draw every output frame with the same `renderFrame` the preview uses,
 * onto an OffscreenCanvas, and encode it with Mediabunny (WebCodecs). Works in a worker or on the
 * main thread.
 *
 * M5 spike status: no media yet (scenes draw placeholders). The real exporter must make sure every
 * asset a frame needs is decoded *before* drawing it (see docs/NEXT-M5.md).
 */

export type ExportContainer = 'mp4' | 'webm';

export interface EncodeOptions {
  project: RenderableProject;
  container: ExportContainer;
  codec: VideoCodec;
  /** Target bitrate in bits per second. */
  bitrate: number;
  /** Render only up to this time (default: the whole story). */
  endMs?: number;
  media?: MediaResolver;
  signal?: AbortSignal;
  onProgress?: (progress: { frame: number; totalFrames: number }) => void;
}

export interface EncodeResult {
  data: ArrayBuffer;
  mimeType: string;
  totalFrames: number;
  /** Time spent drawing frames (renderFrame), in ms. */
  drawMs: number;
  /** Wall-clock time for the whole export, in ms. */
  totalMs: number;
}

export const KEY_FRAME_INTERVAL_S = 2;

/** Number of output frames for a story of `durationMs` at `fps` (the last partial frame counts). */
export function frameCount(durationMs: number, fps: number): number {
  return Math.max(0, Math.ceil((durationMs * fps) / 1000 - 1e-6));
}

export async function encodeStory(options: EncodeOptions): Promise<EncodeResult> {
  const started = performance.now();
  const { project, signal } = options;
  const { width, height, fps } = project.format;
  const storyMs = totalDurationMs(getSceneSpans(project.scenes));
  const endMs = Math.min(options.endMs ?? storyMs, storyMs);
  const totalFrames = frameCount(endMs, fps);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('OffscreenCanvas 2D is not available.');

  const output = new Output({
    format: options.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: options.codec,
    // A bare number would be a 0–1 quality *level*; an explicit bitrate needs the object form.
    quality: new Quality({ bitrate: options.bitrate }),
    keyFrameInterval: KEY_FRAME_INTERVAL_S,
  });
  output.addVideoTrack(source, { frameRate: fps });

  let drawMs = 0;
  try {
    await output.start();
    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Export cancelled', 'AbortError');
      const drawStart = performance.now();
      renderFrame(ctx, project, frameToMs(frame, fps), options.media ?? NO_MEDIA);
      drawMs += performance.now() - drawStart;
      // Awaiting respects encoder backpressure, so memory stays flat for long stories.
      await source.add(frame / fps, 1 / fps);
      options.onProgress?.({ frame: frame + 1, totalFrames });
    }
    await output.finalize();
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw error;
  }

  const data = output.target.buffer;
  if (!data) throw new Error('The encoder produced no data.');
  return {
    data,
    mimeType: options.container === 'mp4' ? 'video/mp4' : 'video/webm',
    totalFrames,
    drawMs,
    totalMs: performance.now() - started,
  };
}

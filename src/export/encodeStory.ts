import {
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  type AudioCodec,
  type AudioSample,
  type VideoCodec,
} from 'mediabunny';
import { renderFrame, type RenderableProject } from '../render/renderFrame';
import { frameToMs, getSceneSpans, totalDurationMs } from '../render/timeline';
import type { ExportMedia } from './exportMedia';
import type { ExportContainer } from './target';

/**
 * The export frame loop: draw every output frame with the same `renderFrame` the preview uses,
 * onto an OffscreenCanvas, and encode it with Mediabunny (WebCodecs). Works in a worker or on the
 * main thread.
 *
 * With `media`, a planning pass first draws every frame with a recording resolver to learn which
 * media each frame needs; then each frame's media is decoded exactly before it is drawn. So no
 * frame ever shows a placeholder for media that was merely still loading (see exportMedia.ts).
 */

export interface EncodeOptions {
  project: RenderableProject;
  container: ExportContainer;
  codec: VideoCodec;
  /** Codec string with a level that fits the frame rate (`fullCodecStringFor`); default: Mediabunny's. */
  fullCodecString?: string;
  /** Target bitrate in bits per second. */
  bitrate: number;
  /** Render only up to this time (default: the whole story). */
  endMs?: number;
  /** Without it, media slots draw placeholders. */
  media?: ExportMedia;
  /** The music, already mixed into story time (see musicStream.ts). Without it: no audio track. */
  audio?: {
    codec: AudioCodec;
    bitrate: number;
    sampleRate: number;
    numberOfChannels: number;
    samples: AsyncIterable<AudioSample>;
  };
  signal?: AbortSignal;
  onProgress?: (progress: { frame: number; totalFrames: number }) => void;
}

export interface EncodeResult {
  data: ArrayBuffer;
  mimeType: string;
  totalFrames: number;
  /** Time spent drawing frames (renderFrame), in ms. */
  drawMs: number;
  /** Time spent decoding/preparing media for frames, in ms. */
  prepareMs: number;
  /** Time spent handing frames to the encoder (incl. waiting for it to catch up), in ms. */
  encodeMs: number;
  /** Time spent mixing and adding audio, in ms. */
  audioMs: number;
  /** Wall-clock time for the whole export, in ms. */
  totalMs: number;
  /** Assets that couldn't be drawn (missing or undecodable) → reason. Those slots show placeholders. */
  mediaFailures: Record<string, string>;
  /** Whether the file has the story's music; `note` explains why not when it was left out. */
  music: { included: boolean; note?: string };
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
    // Mediabunny's own string ignores the frame rate (1080p60 would claim a 30 fps level).
    ...(options.fullCodecString ? { fullCodecString: options.fullCodecString } : {}),
  });
  output.addVideoTrack(source, { frameRate: fps });

  // Music is fed interleaved with the video, about a second ahead of it, so the muxer never waits
  // on one track while the other runs far ahead, and memory stays flat.
  const audio = options.audio;
  const audioSource = audio
    ? new AudioSampleSource({
        codec: audio.codec,
        quality: new Quality({ bitrate: audio.bitrate }),
        transform: { sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels },
      })
    : undefined;
  if (audioSource) output.addAudioTrack(audioSource);
  let audioIterator: AsyncIterator<AudioSample> | undefined;
  let audioUntilS = 0;
  let audioDone = !audioSource;
  const pumpAudio = async (untilS: number) => {
    if (!audioSource || !audio) return;
    audioIterator ??= audio.samples[Symbol.asyncIterator]();
    while (!audioDone && audioUntilS < untilS) {
      const next = await audioIterator.next();
      if (next.done) {
        audioDone = true;
        audioSource.close();
        break;
      }
      audioUntilS = next.value.timestamp + next.value.duration;
      try {
        await audioSource.add(next.value);
      } finally {
        next.value.close();
      }
    }
  };
  const AUDIO_LEAD_S = 1;

  let drawMs = 0;
  let prepareMs = 0;
  let encodeMs = 0;
  let audioMs = 0;
  const media = options.media;
  try {
    if (media) {
      // Planning pass: learn which media every frame needs (cheap; nothing is decoded).
      for (let frame = 0; frame < totalFrames; frame += 1) {
        media.planFrame(frame);
        renderFrame(ctx, project, frameToMs(frame, fps), media.recorder);
      }
      media.finishPlanning();
    }

    await output.start();
    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Export cancelled', 'AbortError');
      const prepareStart = performance.now();
      if (media) await media.prepare(frame);
      prepareMs += performance.now() - prepareStart;
      const drawStart = performance.now();
      renderFrame(ctx, project, frameToMs(frame, fps), media?.resolver);
      drawMs += performance.now() - drawStart;
      media?.endFrame(frame);
      // Awaiting respects encoder backpressure, so memory stays flat for long stories.
      const audioStart = performance.now();
      await pumpAudio(frame / fps + AUDIO_LEAD_S);
      audioMs += performance.now() - audioStart;
      const encodeStart = performance.now();
      await source.add(frame / fps, 1 / fps);
      encodeMs += performance.now() - encodeStart;
      options.onProgress?.({ frame: frame + 1, totalFrames });
    }
    await pumpAudio(Number.POSITIVE_INFINITY);
    await output.finalize();
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    media?.dispose();
  }

  const data = output.target.buffer;
  if (!data) throw new Error('The encoder produced no data.');
  return {
    data,
    mimeType: options.container === 'mp4' ? 'video/mp4' : 'video/webm',
    totalFrames,
    drawMs,
    prepareMs,
    encodeMs,
    audioMs,
    totalMs: performance.now() - started,
    mediaFailures: Object.fromEntries(options.media?.failures() ?? []),
    music: { included: options.audio !== undefined },
  };
}

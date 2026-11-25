import type { AssetKind } from '../domain/asset';
import type { MediaFrame, MediaResolver } from '../render/media';

/**
 * Media for export: every frame is complete, never a placeholder for something still loading.
 *
 * Export is deterministic, so it is planned up front:
 *  1. Planning: for every frame, draw once with `recorder` (cheap; it only records which assets at
 *     which clip times the templates ask for). `finishPlanning()` turns that into, per video
 *     "stream", the full ordered list of clip times, and the first/last frame each asset is used.
 *  2. Encoding: per frame, `await prepare(frame)` decodes exactly what that frame needs, the frame is
 *     drawn with `resolver` (answers synchronously), and `endFrame(frame)` frees anything whose last
 *     use was this frame.
 * Templates need no export-specific code. Video readers receive all their timestamps at once, so a
 * decoder that reads ahead can never wait on a timestamp that comes later.
 */

export interface ExportAsset {
  kind: AssetKind;
  file: Blob;
  /** Clip/song length, from the asset row (caps clip-sound segments like in the preview). */
  durationMs?: number;
}

export interface DecodedFrame {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface DecodedImage extends DecodedFrame {
  close(): void;
}

/** Yields one frame per planned timestamp, in order. */
export interface VideoFrameReader {
  /** The frame for the next planned timestamp (null: none decodable, e.g. past the end). */
  next(): Promise<DecodedFrame | null>;
  dispose(): void;
}

export interface ExportMediaDependencies {
  decodeImage(file: Blob): Promise<DecodedImage>;
  /** Open a reader that will be asked for exactly these clip times (seconds), in this order. */
  openVideo(file: Blob, timestampsS: number[]): Promise<VideoFrameReader>;
}

interface Request {
  assetId: string;
  clipMs: number;
}

/** A video stream: the nth use of a clip within a frame (two scenes showing one clip = 2 streams). */
interface StreamPlan {
  assetId: string;
  timestampsS: number[];
  lastFrame: number;
}

const requestKey = (assetId: string, clipMs: number) => `${assetId}@${clipMs}`;

export function createExportMedia(assets: Readonly<Record<string, ExportAsset>>, deps: ExportMediaDependencies) {
  /** Requests per frame, filled during planning. */
  const plan: Request[][] = [];
  let recording: Request[] = [];
  let planned = false;

  const streams = new Map<string, StreamPlan>();
  const lastImageUse = new Map<string, number>();
  /** Per frame: [streamKey, request] in request order. */
  const frameStreams: Array<Array<[string, Request]>> = [];

  const images = new Map<string, DecodedImage>();
  const readers = new Map<string, VideoFrameReader>();
  /** Last decoded frame per stream, held when a reader returns null. */
  const lastVideoFrame = new Map<string, DecodedFrame>();
  const ready = new Map<string, MediaFrame>();
  const failed = new Map<string, string>();

  const recorder: MediaResolver = {
    frame(assetId, clipMs) {
      recording.push({ assetId, clipMs });
      return undefined;
    },
  };

  const resolver: MediaResolver = {
    frame: (assetId, clipMs) => ready.get(requestKey(assetId, clipMs)),
  };

  function fail(assetId: string, error: unknown): void {
    if (!failed.has(assetId)) failed.set(assetId, error instanceof Error ? error.message : String(error));
  }

  return {
    recorder,
    resolver,

    /** Planning: call before drawing frame `index` with `recorder`. */
    planFrame(index: number): void {
      recording = [];
      plan[index] = recording;
    },

    /** Planning done: build per-stream timestamp lists and last-use frames. */
    finishPlanning(): void {
      plan.forEach((requests, frame) => {
        const uses = new Map<string, number>();
        const seen = new Set<string>();
        const entries: Array<[string, Request]> = [];
        for (const request of requests ?? []) {
          const asset = assets[request.assetId];
          if (!asset) {
            fail(request.assetId, 'missing from the library');
            continue;
          }
          if (asset.kind === 'image') {
            lastImageUse.set(request.assetId, frame);
            continue;
          }
          if (asset.kind !== 'video') continue;
          const key = requestKey(request.assetId, request.clipMs);
          if (seen.has(key)) continue; // same clip at the same time twice: one decode serves both
          seen.add(key);
          const nth = uses.get(request.assetId) ?? 0;
          uses.set(request.assetId, nth + 1);
          const streamKey = `${request.assetId}#${nth}`;
          const stream = streams.get(streamKey) ?? { assetId: request.assetId, timestampsS: [], lastFrame: frame };
          stream.timestampsS.push(Math.max(0, request.clipMs) / 1000);
          stream.lastFrame = frame;
          streams.set(streamKey, stream);
          entries.push([streamKey, request]);
        }
        frameStreams[frame] = entries;
      });
      planned = true;
    },

    /** Decode everything frame `index` needs. Failures are remembered; those slots draw placeholders. */
    async prepare(index: number): Promise<void> {
      if (!planned) throw new Error('exportMedia: finishPlanning() must run before prepare().');
      ready.clear();
      for (const request of plan[index] ?? []) {
        const asset = assets[request.assetId];
        if (asset?.kind !== 'image' || failed.has(request.assetId)) continue;
        try {
          let image = images.get(request.assetId);
          if (!image) {
            image = await deps.decodeImage(asset.file);
            images.set(request.assetId, image);
          }
          ready.set(requestKey(request.assetId, request.clipMs), { source: image.source, width: image.width, height: image.height, kind: 'image' });
        } catch (error) {
          fail(request.assetId, error);
        }
      }
      for (const [streamKey, request] of frameStreams[index] ?? []) {
        const stream = streams.get(streamKey);
        const asset = assets[request.assetId];
        if (!stream || !asset || failed.has(request.assetId)) continue;
        try {
          let reader = readers.get(streamKey);
          if (!reader) {
            reader = await deps.openVideo(asset.file, stream.timestampsS);
            readers.set(streamKey, reader);
          }
          const frame = (await reader.next()) ?? lastVideoFrame.get(streamKey);
          if (!frame) continue;
          lastVideoFrame.set(streamKey, frame);
          ready.set(requestKey(request.assetId, request.clipMs), { source: frame.source, width: frame.width, height: frame.height, kind: 'video' });
        } catch (error) {
          fail(request.assetId, error);
        }
      }
    },

    /** Free images and readers whose last use was frame `index`. */
    endFrame(index: number): void {
      for (const [id, last] of lastImageUse) {
        if (last <= index && images.has(id)) {
          images.get(id)?.close();
          images.delete(id);
        }
      }
      for (const [key, stream] of streams) {
        if (stream.lastFrame <= index && readers.has(key)) {
          readers.get(key)?.dispose();
          readers.delete(key);
          lastVideoFrame.delete(key);
        }
      }
    },

    /** Assets that couldn't be drawn (missing or undecodable) → reason. */
    failures(): Map<string, string> {
      return new Map(failed);
    },

    /** For tests: how many images and readers are open right now. */
    openCounts: () => ({ images: images.size, readers: readers.size }),

    dispose(): void {
      for (const image of images.values()) image.close();
      for (const reader of readers.values()) reader.dispose();
      images.clear();
      readers.clear();
      lastVideoFrame.clear();
      ready.clear();
    },
  };
}

export type ExportMedia = ReturnType<typeof createExportMedia>;

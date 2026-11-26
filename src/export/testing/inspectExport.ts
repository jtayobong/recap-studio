import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import type { MediaFrame, MediaResolver } from '../../render/media';
import { renderFrame, type RenderableProject } from '../../render/renderFrame';
import { flushCanvas } from '../videoReader';

/**
 * Test helper (browser only): decode an exported file and compare frames with `renderFrame`.
 * Used by the export e2e specs; not part of the app.
 */

export interface VideoReport {
  container: string;
  codec: string | null;
  /** Full codec string from the file, e.g. avc1.64002a (High, level 4.2). */
  codecString: string | null;
  width: number;
  height: number;
  durationS: number;
  packetCount: number;
  /** Average packets per second (≈ the frame rate). */
  averagePacketRate: number;
  /**
   * Per compared frame: mean absolute difference per channel (0–255) between the decoded frame and
   * renderFrame, and the share of pixels whose largest channel difference exceeds 48 (catches
   * localized problems such as a missing font that a mean would hide).
   */
  frameDiffs: { timeMs: number; meanAbsDiff: number; badPixelShare: number }[];
}

/** Draw the frame shown at `timeS` over the whole canvas, flushed before the sample is released (D36). */
async function drawFrameAt(sink: VideoSampleSink, timeS: number, ctx: OffscreenCanvasRenderingContext2D): Promise<void> {
  const sample = await sink.getSample(timeS);
  if (!sample) throw new Error(`No frame at ${Math.round(timeS * 1000)} ms`);
  try {
    sample.drawWithFit(ctx, { fit: 'fill' });
    flushCanvas(ctx);
  } finally {
    sample.close();
  }
}

/**
 * Decode an exported file and compare frames against `renderFrame` at the same timestamps.
 * Small differences are expected from lossy encoding and YUV conversion.
 */
export async function inspectExport(
  file: Blob,
  project: RenderableProject,
  timesMs: number[],
  /** Media for the reference frames: a fixed resolver, or one prepared per timestamp. */
  media?: MediaResolver | ((project: RenderableProject, timeMs: number) => Promise<MediaResolver>),
): Promise<VideoReport> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No video track in the export.');
    const stats = await track.computePacketStats();
    const sink = new VideoSampleSink(track);
    const { width, height, fps } = project.format;
    const reference = new OffscreenCanvas(width, height);
    const refCtx = reference.getContext('2d', { alpha: false, willReadFrequently: true })!;
    const decodedCanvas = new OffscreenCanvas(width, height);
    const decodedCtx = decodedCanvas.getContext('2d', { willReadFrequently: true })!;

    const frameDiffs: VideoReport['frameDiffs'] = [];
    for (const timeMs of timesMs) {
      // Middle of the frame, so rounding never picks the neighbour.
      await drawFrameAt(sink, timeMs / 1000 + 0.5 / fps, decodedCtx);
      const resolver = typeof media === 'function' ? await media(project, timeMs) : media;
      renderFrame(refCtx, project, timeMs, resolver);
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
      container: (await input.getFormat()).name,
      codec: track.codec,
      codecString: await track.getCodecParameterString(),
      width: track.displayWidth,
      height: track.displayHeight,
      durationS: await input.computeDuration(),
      packetCount: stats.packetCount,
      averagePacketRate: stats.averagePacketRate,
      frameDiffs,
    };
  } finally {
    input.dispose();
  }
}

/** RGB of single pixels in decoded frames, at fractions (fx, fy) of the frame. */
export async function samplePixels(
  file: Blob,
  fps: number,
  points: { timeMs: number; fx: number; fy: number }[],
): Promise<[number, number, number][]> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No video track in the export.');
    const sink = new VideoSampleSink(track);
    const { displayWidth: width, displayHeight: height } = track;
    const copy = new OffscreenCanvas(width, height);
    const ctx = copy.getContext('2d', { willReadFrequently: true })!;
    const result: [number, number, number][] = [];
    for (const point of points) {
      await drawFrameAt(sink, point.timeMs / 1000 + 0.5 / fps, ctx);
      const d = ctx.getImageData(Math.floor(width * point.fx), Math.floor(height * point.fy), 1, 1).data;
      result.push([d[0]!, d[1]!, d[2]!]);
    }
    return result;
  } finally {
    input.dispose();
  }
}

/**
 * Reference media for comparing exports, decoded independently of the exporter's own path:
 * photos via createImageBitmap, clip frames via random-access `VideoSampleSink.getSample` (the
 * exporter streams with `samplesAtTimestamps`), each copied and flushed before release (D36).
 * Per timestamp it records which media the frame asks for, decodes exactly that, and returns a
 * resolver for the reference draw.
 */
export function referenceMedia(assets: Record<string, { kind: 'image' | 'video' | 'audio'; file: Blob }>) {
  const images = new Map<string, ImageBitmap>();
  const sinks = new Map<string, Promise<VideoSampleSink>>();

  const sinkFor = (id: string, file: Blob) => {
    let sink = sinks.get(id);
    if (!sink) {
      sink = (async () => {
        const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error('No video track');
        return new VideoSampleSink(track);
      })();
      sinks.set(id, sink);
    }
    return sink;
  };

  return async (project: RenderableProject, timeMs: number): Promise<MediaResolver> => {
    const requests: { id: string; clipMs: number }[] = [];
    const scratch = new OffscreenCanvas(project.format.width, project.format.height).getContext('2d')!;
    renderFrame(scratch, project, timeMs, { frame: (id, clipMs) => (requests.push({ id, clipMs }), undefined) });

    const ready = new Map<string, MediaFrame>();
    for (const { id, clipMs } of requests) {
      const asset = assets[id];
      if (!asset) continue;
      if (asset.kind === 'image') {
        let bitmap = images.get(id);
        if (!bitmap) {
          bitmap = await createImageBitmap(asset.file);
          images.set(id, bitmap);
        }
        ready.set(`${id}@${clipMs}`, { source: bitmap, width: bitmap.width, height: bitmap.height, kind: 'image' });
      } else if (asset.kind === 'video') {
        const sample = await (await sinkFor(id, asset.file)).getSample(Math.max(0, clipMs) / 1000);
        if (!sample) continue;
        const copy = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
        const copyCtx = copy.getContext('2d')!;
        try {
          sample.drawWithFit(copyCtx, { fit: 'fill' });
          flushCanvas(copyCtx);
        } finally {
          sample.close();
        }
        ready.set(`${id}@${clipMs}`, { source: copy, width: copy.width, height: copy.height, kind: 'video' });
      }
    }
    return { frame: (id, clipMs) => ready.get(`${id}@${clipMs}`) };
  };
}

export interface AudioReport {
  codec: string | null;
  sampleRate: number;
  channels: number;
  durationS: number;
  /** Root-mean-square level (0–1, first channel) in each requested window [startS, endS). */
  rms: number[];
  /** Per window, the amplitude (0–1) of each requested frequency (Goertzel), first channel. */
  tones: number[][];
}

/** Decode an export's audio track and measure its level in time windows; null if it has none. */
export async function inspectAudio(file: Blob, windowsS: [number, number][], frequencies: number[] = []): Promise<AudioReport | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const sums = windowsS.map(() => ({ sum: 0, count: 0 }));
    const windowSamples: number[][] = windowsS.map(() => []);
    let rate = 0;
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const options = { planeIndex: 0, format: 'f32-planar' as const };
        const plane = new Float32Array(sample.allocationSize(options) / 4);
        sample.copyTo(plane, options);
        rate = sample.sampleRate;
        for (let i = 0; i < plane.length; i += 1) {
          const t = sample.timestamp + i / sample.sampleRate;
          windowsS.forEach(([start, end], w) => {
            if (t >= start && t < end) {
              sums[w]!.sum += plane[i]! * plane[i]!;
              sums[w]!.count += 1;
              if (frequencies.length > 0) windowSamples[w]!.push(plane[i]!);
            }
          });
        }
      } finally {
        sample.close();
      }
    }
    return {
      codec: track.codec,
      sampleRate: track.sampleRate,
      channels: track.numberOfChannels,
      durationS: await track.computeDuration(),
      rms: sums.map(({ sum, count }) => (count > 0 ? Math.sqrt(sum / count) : 0)),
      tones: windowSamples.map((samples) => frequencies.map((f) => goertzel(samples, f, rate))),
    };
  } finally {
    input.dispose();
  }
}

/** Amplitude of frequency `f` in `samples` (Goertzel algorithm): a sine of amplitude A gives ≈ A. */
function goertzel(samples: number[], f: number, rate: number): number {
  const n = samples.length;
  if (n === 0 || rate === 0) return 0;
  const coefficient = 2 * Math.cos((2 * Math.PI * f) / rate);
  let s1 = 0;
  let s2 = 0;
  for (const x of samples) {
    const s0 = x + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coefficient * s1 * s2;
  return (2 * Math.sqrt(Math.max(0, power))) / n;
}

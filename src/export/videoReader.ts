import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from 'mediabunny';
import { fitWithin } from '../media/browserProbe';
import type { DecodedFrame, VideoFrameReader } from './exportMedia';

/** Decoded video frames are never larger than this on their long edge (same cap as photos). */
const MAX_EDGE = 2160;

/**
 * Frame-exact video frames for export. Opened with the complete, ordered list of clip times it will
 * be asked for (from the export plan); each `next()` yields the frame shown at the next time: the
 * last frame starting at or before it. Mediabunny decodes each packet at most once for monotonic
 * timestamps and may read ahead freely, since all timestamps are known up front.
 *
 * Each frame is copied into the reader's own canvas and the copy is forced to finish before the
 * decoded sample is released (D36). Canvas drawing is deferred on the GPU, and a hardware decoder
 * may reuse a frame's memory for a later frame before a deferred draw runs: in Edge, with the
 * hardware encoder busy, a 30 fps HEVC phone clip showed frames 8–15 frames ahead every few frames
 * (with Mediabunny's `CanvasSink`, and still when the sample was kept open until the next frame).
 * A 1-pixel `getImageData` makes the draw run now; it costs well under a millisecond per frame.
 */
export class MediabunnyVideoReader implements VideoFrameReader {
  private held: VideoSample | null = null;

  private constructor(
    private readonly input: Input,
    private readonly samples: AsyncGenerator<VideoSample | null, void, unknown>,
    private readonly canvas: OffscreenCanvas,
    private readonly ctx: OffscreenCanvasRenderingContext2D,
  ) {}

  static async open(file: Blob, timestampsS: number[]): Promise<MediabunnyVideoReader> {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('The file has no video track.');
      if (!(await track.canDecode())) throw new Error(`This browser can't decode ${track.codec ?? 'this'} video.`);
      const size = fitWithin(track.displayWidth, track.displayHeight, MAX_EDGE);
      // One canvas per reader, redrawn on every next(): the previous frame has been encoded by then.
      const canvas = new OffscreenCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('OffscreenCanvas 2D is not available.');
      ctx.imageSmoothingQuality = 'high';
      const samples = new VideoSampleSink(track).samplesAtTimestamps(timestampsS);
      return new MediabunnyVideoReader(input, samples, canvas, ctx);
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  async next(): Promise<DecodedFrame | null> {
    // The caller has finished with the previous frame (see VideoFrameReader). The sample is kept
    // until then anyway: the copy is already complete, so this only adds a margin.
    this.release();
    const result = await this.samples.next();
    if (result.done || !result.value) return null;
    const sample = result.value;
    this.held = sample;
    // 'fill' with the track's display size (aspect kept by fitWithin); applies rotation metadata.
    sample.drawWithFit(this.ctx, { fit: 'fill' });
    flushCanvas(this.ctx);
    return { source: this.canvas, width: this.canvas.width, height: this.canvas.height };
  }

  dispose(): void {
    this.release();
    void this.samples.return(undefined);
    this.input.dispose();
  }

  private release(): void {
    this.held?.close();
    this.held = null;
  }
}

/**
 * Make pending draws on a 2D canvas run now (D36), so a decoded video frame drawn into it can be
 * released safely: reading back one pixel forces the GPU to execute the queued commands.
 */
export function flushCanvas(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D): void {
  ctx.getImageData(0, 0, 1, 1);
}

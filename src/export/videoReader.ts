import { ALL_FORMATS, BlobSource, CanvasSink, Input, type WrappedCanvas } from 'mediabunny';
import { fitWithin } from '../media/browserProbe';
import type { DecodedFrame, VideoFrameReader } from './exportMedia';

/** Decoded video frames are never larger than this on their long edge (same cap as photos). */
const MAX_EDGE = 2160;

/**
 * Frame-exact video frames for export. Opened with the complete, ordered list of clip times it will
 * be asked for (from the export plan); each `next()` yields the frame shown at the next time: the
 * last frame starting at or before it. Mediabunny decodes each packet at most once for monotonic
 * timestamps and may read ahead freely, since all timestamps are known up front.
 */
export class MediabunnyVideoReader implements VideoFrameReader {
  private constructor(
    private readonly input: Input,
    private readonly frames: AsyncGenerator<WrappedCanvas | null, void, unknown>,
  ) {}

  static async open(file: Blob, timestampsS: number[]): Promise<MediabunnyVideoReader> {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('The file has no video track.');
      if (!(await track.canDecode())) throw new Error(`This browser can't decode ${track.codec ?? 'this'} video.`);
      const size = fitWithin(track.displayWidth, track.displayHeight, MAX_EDGE);
      // No canvas pool: each yielded canvas stays valid while it is drawn, even if decoding reads ahead.
      const sink = new CanvasSink(track, { width: size.width, height: size.height, fit: 'fill' });
      return new MediabunnyVideoReader(input, sink.canvasesAtTimestamps(timestampsS));
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  async next(): Promise<DecodedFrame | null> {
    const result = await this.frames.next();
    if (result.done || !result.value) return null;
    const { canvas } = result.value;
    return { source: canvas, width: canvas.width, height: canvas.height };
  }

  dispose(): void {
    void this.frames.return(undefined);
    this.input.dispose();
  }
}

import { canEncodeVideo, Quality, type VideoCodec } from 'mediabunny';
import { videoCodecString } from './codecString';

export type ExportContainer = 'mp4' | 'webm';

export interface ExportTarget {
  container: ExportContainer;
  codec: VideoCodec;
  mimeType: string;
  extension: string;
}

const CANDIDATES: ExportTarget[] = [
  { container: 'mp4', codec: 'avc', mimeType: 'video/mp4', extension: 'mp4' },
  { container: 'webm', codec: 'vp9', mimeType: 'video/webm', extension: 'webm' },
];

/** The codec string for a target's codec, or undefined for codecs we let Mediabunny describe. */
export function fullCodecStringFor(codec: VideoCodec, width: number, height: number, fps: number, bitrate: number): string | undefined {
  return codec === 'avc' || codec === 'vp9' ? videoCodecString(codec, width, height, fps, bitrate) : undefined;
}

/** H.264 in MP4 when this browser can encode it at this size, frame rate and bitrate, else VP9 in WebM. */
export async function pickTarget(width: number, height: number, bitrate: number, fps: number): Promise<ExportTarget | null> {
  for (const candidate of CANDIDATES) {
    const fullCodecString = fullCodecStringFor(candidate.codec, width, height, fps, bitrate);
    if (await canEncodeVideo(candidate.codec, { width, height, frameRate: fps, quality: new Quality({ bitrate }), fullCodecString })) {
      return candidate;
    }
  }
  return null;
}

export function targetFor(container: ExportContainer): ExportTarget {
  const target = CANDIDATES.find((c) => c.container === container);
  if (!target) throw new Error(`Unknown container ${container}`);
  return target;
}

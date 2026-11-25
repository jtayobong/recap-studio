import { IMAGE_MAX_EDGE, type SupportedMimeType } from '../domain/asset';
import { NoVideoTrackError, type MediaProbe, type ProbedAudio, type ProbedImage, type ProbedVideo } from './importAsset';

/** Long edge of library/inspector thumbnails, in pixels. */
export const THUMB_MAX_EDGE = 480;
const THUMB_QUALITY = 0.8;
const REENCODE_QUALITY = 0.9;
/** How long to wait for a video element before treating the file as unplayable. */
export const VIDEO_TIMEOUT_MS = 15_000;

/** Scale (width, height) down so the long edge is at most `maxEdge`. Never scales up. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Format to re-encode a downscaled image in. GIF becomes PNG (only the first frame is used). */
export function reencodeMimeType(mime: SupportedMimeType): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (mime === 'image/jpeg' || mime === 'image/webp') return mime;
  return 'image/png';
}

function drawScaled(source: CanvasImageSource, width: number, height: number, maxEdge: number): OffscreenCanvas {
  const size = fitWithin(width, height, maxEdge);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

async function thumbnailOf(source: CanvasImageSource, width: number, height: number): Promise<Blob | undefined> {
  try {
    return await drawScaled(source, width, height, THUMB_MAX_EDGE).convertToBlob({ type: 'image/webp', quality: THUMB_QUALITY });
  } catch {
    return undefined; // a missing thumbnail is not worth failing the import for
  }
}

async function probeImage(file: Blob, mime: SupportedMimeType): Promise<ProbedImage> {
  // createImageBitmap applies EXIF orientation, so width/height are as displayed.
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const thumbnail = await thumbnailOf(bitmap, width, height);
    if (Math.max(width, height) <= IMAGE_MAX_EDGE) {
      // Small enough: keep the original bytes (no generational quality loss).
      return { width, height, data: file, mime, thumbnail };
    }
    // Re-encoding also drops EXIF metadata such as GPS location.
    const type = reencodeMimeType(mime);
    const canvas = drawScaled(bitmap, width, height, IMAGE_MAX_EDGE);
    const data = await canvas.convertToBlob({ type, quality: REENCODE_QUALITY });
    return { width: canvas.width, height: canvas.height, data, mime: type, thumbnail };
  } finally {
    bitmap.close();
  }
}

function waitFor(video: HTMLMediaElement, event: keyof HTMLMediaElementEventMap): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message || 'The file could not be decoded.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out reading the video.'));
    }, VIDEO_TIMEOUT_MS);
    video.addEventListener(event, onEvent);
    video.addEventListener('error', onError);
  });
}

async function seek(video: HTMLMediaElement, seconds: number): Promise<void> {
  const seeked = waitFor(video, 'seeked');
  video.currentTime = seconds;
  await seeked;
}

/**
 * Media duration in seconds. Some files (e.g. MediaRecorder WebM) don't store one: seeking far
 * past the end makes the browser scan the file and report the real length.
 */
async function durationOf(element: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(element.duration)) return element.duration;
  await seek(element, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(element.duration)) throw new Error('The media’s length could not be determined.');
  return element.duration;
}

async function probeAudio(file: Blob): Promise<ProbedAudio> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  try {
    const metadata = waitFor(audio, 'loadedmetadata');
    audio.src = url;
    await metadata;
    return { durationMs: Math.round((await durationOf(audio)) * 1000) };
  } finally {
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
  }
}

async function probeVideo(file: Blob): Promise<ProbedVideo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const metadata = waitFor(video, 'loadedmetadata');
    video.src = url;
    await metadata;

    const { videoWidth: width, videoHeight: height } = video;
    // Sound but no picture: the importer takes it as an audio file instead.
    if (width === 0 || height === 0) throw new NoVideoTrackError();

    const duration = await durationOf(video);

    // Poster frame: a little way in, to skip black lead-in frames.
    await seek(video, Math.min(0.5, duration / 2));
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitFor(video, 'loadeddata');
    const thumbnail = await thumbnailOf(video, width, height);

    return { width, height, durationMs: Math.round(duration * 1000), thumbnail };
  } finally {
    video.removeAttribute('src');
    video.load(); // releases the decoder
    URL.revokeObjectURL(url);
  }
}

export function createBrowserProbe(): MediaProbe {
  return { image: probeImage, video: probeVideo, audio: probeAudio };
}

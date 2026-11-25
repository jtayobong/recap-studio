/// <reference lib="webworker" />
import { encodeStory, type EncodeOptions, type EncodeResult } from './encodeStory';
import type { AudioTrack } from '../domain/project';
import { getSceneSpans, totalDurationMs } from '../render/timeline';
import { createExportMedia, type ExportAsset } from './exportMedia';
import { soundSegments } from '../render/clipSound';
import {
  AUDIO_BITRATE,
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  audioCodecFor,
  canEncodeAudioCodec,
  openAudioMix,
  type OpenedMix,
} from './audioSources';
import { MediabunnyVideoReader } from './videoReader';

/**
 * Export worker: renders and encodes off the main thread, so the editor stays responsive.
 *
 *   → { type: 'start', options, assets }  options: the encode settings and a snapshot of the project;
 *                                          assets: asset id → { kind, file } (Blobs pass by reference)
 *   → { type: 'cancel' }
 *   ← { type: 'progress', frame, totalFrames }   (throttled to ~10/s, plus the last frame)
 *   ← { type: 'done', result }                    (result.data is transferred, not copied)
 *   ← { type: 'error', message, cancelled }
 */

export type WorkerEncodeOptions = Omit<EncodeOptions, 'signal' | 'onProgress' | 'media' | 'audio'> & {
  /** The story's music track settings; its file is in `assets`. */
  music?: AudioTrack;
};

export type ExportRequest =
  | { type: 'start'; options: WorkerEncodeOptions; assets: Record<string, ExportAsset> }
  | { type: 'cancel' };

export type ExportResponse =
  | { type: 'progress'; frame: number; totalFrames: number }
  | { type: 'done'; result: EncodeResult }
  | { type: 'error'; message: string; cancelled: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let controller: AbortController | null = null;
let lastProgressAt = 0;

const post = (message: ExportResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    controller?.abort(new DOMException('Export cancelled', 'AbortError'));
    return;
  }
  if (controller) return; // one export per worker at a time
  controller = new AbortController();
  let mix: OpenedMix | null = null;
  try {
    // Fonts: the app uses system font stacks, which need no loading. Don't await
    // `self.fonts.ready` here: in a dedicated worker it never resolved (Chromium, M5 step 2).
    // Self-hosted fonts must be added with `new FontFace(...)` and an explicit `await face.load()`.
    const media = createExportMedia(request.assets, {
      decodeImage: async (file) => {
        const bitmap = await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      },
      openVideo: (file, timestampsS) => MediabunnyVideoReader.open(file, timestampsS),
    });

    // Audio: the music plus clips with "Keep clip sound". Optional: if it can't be included, the
    // video still exports and says why.
    const { music: track, ...encodeOptions } = request.options;
    const storyMs = Math.min(
      totalDurationMs(getSceneSpans(encodeOptions.project.scenes)),
      encodeOptions.endMs ?? Number.POSITIVE_INFINITY,
    );
    const lookup = (id: string) => request.assets[id];
    const clips = soundSegments(encodeOptions.project.scenes, lookup)
      .filter((segment) => segment.startMs < storyMs)
      .map((segment) => ({ file: request.assets[segment.assetId]!.file, segment: { ...segment, endMs: Math.min(segment.endMs, storyMs) } }));
    const musicFile = track ? request.assets[track.assetId] : undefined;
    let musicNote: string | undefined;
    if (track && musicFile?.kind !== 'audio') musicNote = 'The song is no longer in the library, so the video has no music.';
    const wantsMusic = track !== undefined && musicFile?.kind === 'audio';
    const audioCodec = audioCodecFor(encodeOptions.container);
    if (wantsMusic || clips.length > 0) {
      if (!(await canEncodeAudioCodec(audioCodec))) {
        musicNote = `This browser can't encode ${audioCodec.toUpperCase()} audio, so the video has no sound.`;
      } else {
        mix = await openAudioMix({ storyMs, music: wantsMusic ? { file: musicFile!.file, track: track! } : undefined, clips });
        musicNote ??= mix.musicNote;
      }
    }

    const encoded = await encodeStory({
      ...encodeOptions,
      media,
      audio: mix?.samples
        ? { codec: audioCodec, bitrate: AUDIO_BITRATE, sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: AUDIO_CHANNELS, samples: mix.samples }
        : undefined,
      signal: controller.signal,
      onProgress: ({ frame, totalFrames }) => {
        const now = performance.now();
        if (frame === totalFrames || now - lastProgressAt > 100) {
          lastProgressAt = now;
          post({ type: 'progress', frame, totalFrames });
        }
      },
    });
    const result: EncodeResult = { ...encoded, music: { included: mix?.musicIncluded ?? false, note: musicNote } };
    post({ type: 'done', result }, [result.data]);
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === 'AbortError';
    post({ type: 'error', message: error instanceof Error ? error.message : String(error), cancelled });
  } finally {
    mix?.dispose();
    controller = null;
  }
};

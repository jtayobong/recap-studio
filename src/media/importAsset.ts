import { AUDIO_ONLY_FALLBACK, MEDIA_LIMITS, SUPPORTED_MIME_TYPES, type Asset, type AssetKind, type SupportedMimeType } from '../domain/asset';
import type { AssetRepository } from '../db/assetRepository';
import { StorageFullError } from '../db/opfsStore';
import { describeError } from '../lib/errors';
import { formatBytes, formatDuration } from '../lib/format';
import { readHeader, sniffMimeType } from './sniff';

export type ImportErrorReason = 'unsupported' | 'too-large' | 'too-long' | 'unreadable' | 'storage-full' | 'cancelled';

/** A user-facing import failure. `message` is written to be shown as-is. */
export class ImportError extends Error {
  constructor(
    readonly reason: ImportErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ProbedImage {
  width: number;
  height: number;
  /** What to store: the original file, or a downscaled re-encode. */
  data: Blob;
  mime: SupportedMimeType;
  thumbnail?: Blob;
}

export interface ProbedVideo {
  width: number;
  height: number;
  durationMs: number;
  thumbnail?: Blob;
}

export interface ProbedAudio {
  durationMs: number;
}

/** Thrown by `MediaProbe.video` for a container with sound but no picture (imported as audio). */
export class NoVideoTrackError extends Error {
  constructor() {
    super('The file has no video picture.');
    this.name = 'NoVideoTrackError';
  }
}

/** Decoding and thumbnailing. The browser implementation is in `browserProbe.ts`. */
export interface MediaProbe {
  image(file: Blob, mime: SupportedMimeType): Promise<ProbedImage>;
  video(file: Blob): Promise<ProbedVideo>;
  audio(file: Blob): Promise<ProbedAudio>;
}

export interface ImportDependencies {
  assets: Pick<AssetRepository, 'add'>;
  probe: MediaProbe;
  /** `navigator.storage.estimate`; omitted or failing means "unknown", and the write decides. */
  estimateStorage?: () => Promise<{ usage?: number; quota?: number } | undefined>;
  /** Ask the browser to keep our data. Called once, before the first import is stored. */
  requestPersistence?: () => Promise<unknown>;
}

export type ImportPhase = 'checking' | 'processing' | 'saving';

export interface ImportOptions {
  /** `fraction` is set while saving (0–1). */
  onProgress?: (progress: { phase: ImportPhase; fraction?: number }) => void;
  signal?: AbortSignal;
}

/** Headroom kept free beyond the file itself, for the database and the browser. */
export const STORAGE_MARGIN_BYTES = 32 * 1024 * 1024;

export interface ImportResult {
  imported: Asset[];
  failed: { filename: string; error: ImportError }[];
}

const SUPPORTED_LIST = 'JPEG, PNG, WebP, GIF, MP4, MOV, WebM, MP3, M4A, WAV, OGG or FLAC';

const KIND_PLURAL: Record<AssetKind, string> = { image: 'Images', video: 'Videos', audio: 'Audio files' };

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function checkAborted(signal: AbortSignal | undefined, filename: string): void {
  if (signal?.aborted) throw new ImportError('cancelled', `Import of “${filename}” was cancelled.`);
}

/**
 * Validates, processes and stores media files for one project. Steps, in order:
 * sniff the real format → check size limits → decode/probe (and downscale images) → check
 * duration → check free storage → request persistent storage (once) → stream into OPFS.
 */
export function createImporter(deps: ImportDependencies) {
  let persistenceRequested = false;

  async function hasRoomFor(bytes: number): Promise<boolean> {
    try {
      const estimate = await deps.estimateStorage?.();
      if (estimate?.quota === undefined || estimate.usage === undefined) return true;
      return estimate.quota - estimate.usage >= bytes + STORAGE_MARGIN_BYTES;
    } catch {
      return true;
    }
  }

  async function importFile(file: File, projectId: string, options: ImportOptions = {}): Promise<Asset> {
    const { onProgress, signal } = options;
    const filename = file.name || 'untitled';
    try {
      checkAborted(signal, filename);
      onProgress?.({ phase: 'checking' });

      const mime = sniffMimeType(await readHeader(file));
      if (!mime) {
        throw new ImportError('unsupported', `“${filename}” isn’t a supported photo, video or audio file. Use ${SUPPORTED_LIST}.`);
      }
      const kind = SUPPORTED_MIME_TYPES[mime];
      // An audio-only MP4/WebM is checked against the (larger) video size limit first; the
      // audio limit applies once probing shows there's no picture.
      const limit = MEDIA_LIMITS[kind].maxBytes;
      if (file.size > limit) {
        throw new ImportError('too-large', `“${filename}” is ${formatBytes(file.size)}. ${KIND_PLURAL[kind]} can be up to ${formatBytes(limit)}.`);
      }

      checkAborted(signal, filename);
      onProgress?.({ phase: 'processing' });

      const asAudio = async (audioMime: SupportedMimeType): Promise<Parameters<AssetRepository['add']>[0]> => {
        if (file.size > MEDIA_LIMITS.audio.maxBytes) {
          throw new ImportError('too-large', `“${filename}” is ${formatBytes(file.size)}. Audio files can be up to ${formatBytes(MEDIA_LIMITS.audio.maxBytes)}.`);
        }
        const probed = await probe(() => deps.probe.audio(file), filename, 'audio');
        checkDuration(probed.durationMs, 'audio', filename);
        return { projectId, kind: 'audio', mime: audioMime, filename, durationMs: Math.round(probed.durationMs), data: file };
      };

      let input: Parameters<AssetRepository['add']>[0];
      if (kind === 'audio') {
        input = await asAudio(mime);
      } else if (kind === 'image') {
        const probed = await probe(() => deps.probe.image(file, mime), filename, 'image');
        input = { projectId, kind, mime: probed.mime, filename, width: probed.width, height: probed.height, data: probed.data, thumbnail: probed.thumbnail };
      } else {
        // `null`: the container has sound but no picture, so it becomes an audio asset.
        const probed = await probe(() => deps.probe.video(file), filename, 'video').catch((error: unknown) => {
          if (error instanceof NoVideoTrackError && AUDIO_ONLY_FALLBACK[mime]) return null;
          throw error;
        });
        if (probed === null) {
          input = await asAudio(AUDIO_ONLY_FALLBACK[mime] as SupportedMimeType);
        } else {
          checkDuration(probed.durationMs, 'video', filename);
          input = {
            projectId,
            kind,
            mime,
            filename,
            width: probed.width,
            height: probed.height,
            durationMs: Math.round(probed.durationMs),
            data: file, // streamed from disk, never fully loaded
            thumbnail: probed.thumbnail,
          };
        }
      }

      const total = input.data instanceof Blob ? input.data.size : file.size;
      if (!(await hasRoomFor(total + (input.thumbnail?.size ?? 0)))) throw new StorageFullError();

      checkAborted(signal, filename);
      if (!persistenceRequested) {
        persistenceRequested = true;
        await deps.requestPersistence?.().catch(() => undefined);
      }

      onProgress?.({ phase: 'saving', fraction: 0 });
      return await deps.assets.add(input, {
        signal,
        onProgress: (written) => onProgress?.({ phase: 'saving', fraction: total > 0 ? Math.min(1, written / total) : 1 }),
      });
    } catch (error) {
      throw toImportError(error, filename);
    }
  }

  /** Imports files one after another; one failure doesn't stop the rest (except cancel). */
  async function importFiles(
    files: Iterable<File>,
    projectId: string,
    options: ImportOptions & { onFileStart?: (file: File, index: number) => void } = {},
  ): Promise<ImportResult> {
    const result: ImportResult = { imported: [], failed: [] };
    let index = 0;
    for (const file of files) {
      options.onFileStart?.(file, index);
      index += 1;
      try {
        result.imported.push(await importFile(file, projectId, options));
      } catch (error) {
        const importError = toImportError(error, file.name);
        result.failed.push({ filename: file.name, error: importError });
        if (importError.reason === 'cancelled') break;
      }
    }
    return result;
  }

  return { importFile, importFiles };
}

export type Importer = ReturnType<typeof createImporter>;

async function probe<T>(run: () => Promise<T>, filename: string, kind: AssetKind): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ImportError || error instanceof NoVideoTrackError || isAbort(error)) throw error;
    throw new ImportError(
      'unreadable',
      kind === 'image'
        ? `“${filename}” couldn’t be decoded. The file may be damaged.`
        : `“${filename}” can’t be played in this browser. The file may be damaged or use an unsupported codec.`,
    );
  }
}

function checkDuration(durationMs: number, kind: 'video' | 'audio', filename: string): void {
  const maxMs = MEDIA_LIMITS[kind].maxDurationMs;
  if (durationMs > maxMs) {
    throw new ImportError('too-long', `“${filename}” is ${formatDuration(durationMs)} long. ${KIND_PLURAL[kind]} can be up to ${formatDuration(maxMs)}.`);
  }
}

function toImportError(error: unknown, filename: string): ImportError {
  if (error instanceof ImportError) return error;
  if (error instanceof StorageFullError) return new ImportError('storage-full', error.message);
  if (isAbort(error)) return new ImportError('cancelled', `Import of “${filename}” was cancelled.`);
  return new ImportError('unreadable', `“${filename}” couldn’t be imported: ${describeError(error)}`);
}

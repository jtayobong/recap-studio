/**
 * A tiny file store over the Origin Private File System. Only `assetRepository` uses it
 * (invariant 3: storage access stays inside `src/db`).
 *
 * Files are addressed as `<dir>/<name>` with a single directory level. Writes stream, so a large
 * video is never held in memory, and they go to a swap file that the browser commits on close:
 * a failed or aborted write leaves no partial file behind.
 */

export class StorageFullError extends Error {
  constructor() {
    super('Not enough storage space. Free up disk space or delete unused media, then try again.');
    this.name = 'StorageFullError';
  }
}

export interface WriteOptions {
  /** Called after each chunk with the total number of bytes written so far. */
  onProgress?: (bytesWritten: number) => void;
  signal?: AbortSignal;
}

export interface StoredFileInfo {
  name: string;
  lastModified: number;
}

export interface BlobStore {
  /** Writes (or replaces) a file and resolves with the number of bytes written. */
  write(dir: string, name: string, data: Blob | ReadableStream<Uint8Array>, options?: WriteOptions): Promise<number>;
  /** Resolves with the file, or undefined if it doesn't exist. */
  read(dir: string, name: string): Promise<File | undefined>;
  /** Deletes a file. Deleting a missing file is not an error. */
  remove(dir: string, name: string): Promise<void>;
  /** Lists the files in a directory (empty if the directory doesn't exist). */
  list(dir: string): Promise<StoredFileInfo[]>;
}

function hasName(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}

const isNotFound = (error: unknown) => hasName(error, 'NotFoundError');
const isQuotaError = (error: unknown) => hasName(error, 'QuotaExceededError');

export function createOpfsStore(
  getRoot: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory(),
): BlobStore {
  let rootPromise: Promise<FileSystemDirectoryHandle> | undefined;

  function root(): Promise<FileSystemDirectoryHandle> {
    rootPromise ??= getRoot().catch((error: unknown) => {
      rootPromise = undefined; // allow a retry
      throw error;
    });
    return rootPromise;
  }

  async function existingDirectory(dir: string): Promise<FileSystemDirectoryHandle | undefined> {
    try {
      return await (await root()).getDirectoryHandle(dir);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async function write(
    dir: string,
    name: string,
    data: Blob | ReadableStream<Uint8Array>,
    options: WriteOptions = {},
  ): Promise<number> {
    const folder = await (await root()).getDirectoryHandle(dir, { create: true });
    const handle = await folder.getFileHandle(name, { create: true });
    let written = 0;
    try {
      const writable = await handle.createWritable();
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          written += chunk.byteLength;
          controller.enqueue(chunk);
          options.onProgress?.(written);
        },
      });
      const source: ReadableStream<Uint8Array> = data instanceof Blob ? data.stream() : data;
      // pipeTo aborts the writable on any error, which discards the swap file.
      await source.pipeThrough(counter).pipeTo(writable, { signal: options.signal });
    } catch (error) {
      // `create: true` left an empty file behind; callers always write to fresh names.
      await folder.removeEntry(name).catch(() => undefined);
      throw isQuotaError(error) ? new StorageFullError() : error;
    }
    return written;
  }

  async function read(dir: string, name: string): Promise<File | undefined> {
    const folder = await existingDirectory(dir);
    if (!folder) return undefined;
    try {
      return await (await folder.getFileHandle(name)).getFile();
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async function remove(dir: string, name: string): Promise<void> {
    const folder = await existingDirectory(dir);
    if (!folder) return;
    try {
      await folder.removeEntry(name);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async function list(dir: string): Promise<StoredFileInfo[]> {
    const folder = await existingDirectory(dir);
    if (!folder) return [];
    const files: StoredFileInfo[] = [];
    for await (const handle of folder.values()) {
      if (handle.kind !== 'file') continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({ name: handle.name, lastModified: file.lastModified });
      } catch (error) {
        if (!isNotFound(error)) throw error; // deleted while listing
      }
    }
    return files;
  }

  return { write, read, remove, list };
}

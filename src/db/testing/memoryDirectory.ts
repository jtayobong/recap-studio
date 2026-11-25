/**
 * Minimal in-memory stand-in for an OPFS `FileSystemDirectoryHandle`, for unit tests in Node.
 * It implements only what `opfsStore` uses, with OPFS semantics where they matter:
 * - writes go to a swap buffer that becomes visible on close; abort discards it
 * - missing entries reject with a `NotFoundError` DOMException
 * - an optional quota makes writes reject with `QuotaExceededError`
 * - invalid names (empty, `.`/`..`, containing a slash) throw a TypeError
 */

interface Quota {
  limit: number;
  used: number;
}

export interface MemoryDirectoryOptions {
  /** Total bytes that may be stored across all files. */
  quotaBytes?: number;
  /** Clock used for `lastModified`. */
  now?: () => number;
}

function notFound(name: string): DOMException {
  return new DOMException(`${name} was not found`, 'NotFoundError');
}

function checkName(name: string): void {
  if (name === '' || name === '.' || name === '..' || /[\\/]/.test(name)) {
    throw new TypeError(`Name is not allowed: ${name}`);
  }
}

async function toBytes(chunk: unknown): Promise<Uint8Array> {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  if (chunk instanceof Blob) return new Uint8Array(await chunk.arrayBuffer());
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk);
  throw new TypeError('Unsupported chunk type');
}

class MemoryFileHandle {
  readonly kind = 'file';
  private blob = new Blob([]);
  private modified: number;

  constructor(
    readonly name: string,
    private readonly quota: Quota,
    private readonly now: () => number,
  ) {
    this.modified = now();
  }

  get size(): number {
    return this.blob.size;
  }

  async getFile(): Promise<File> {
    return new File([this.blob], this.name, { lastModified: this.modified });
  }

  async createWritable(): Promise<WritableStream> {
    const parts: Uint8Array[] = [];
    let pending = 0;
    return new WritableStream({
      write: async (chunk: unknown) => {
        const bytes = await toBytes(chunk);
        if (this.quota.used - this.blob.size + pending + bytes.byteLength > this.quota.limit) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        parts.push(bytes.slice());
        pending += bytes.byteLength;
      },
      close: () => {
        this.quota.used += pending - this.blob.size;
        this.blob = new Blob(parts as BlobPart[]);
        this.modified = this.now();
      },
    });
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory';
  private readonly entries = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();

  constructor(
    readonly name: string,
    private readonly quota: Quota,
    private readonly now: () => number,
  ) {}

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectoryHandle> {
    checkName(name);
    const entry = this.entries.get(name);
    if (entry instanceof MemoryDirectoryHandle) return entry;
    if (entry) throw new DOMException(`${name} is a file`, 'TypeMismatchError');
    if (!options.create) throw notFound(name);
    const created = new MemoryDirectoryHandle(name, this.quota, this.now);
    this.entries.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryFileHandle> {
    checkName(name);
    const entry = this.entries.get(name);
    if (entry instanceof MemoryFileHandle) return entry;
    if (entry) throw new DOMException(`${name} is a directory`, 'TypeMismatchError');
    if (!options.create) throw notFound(name);
    const created = new MemoryFileHandle(name, this.quota, this.now);
    this.entries.set(name, created);
    return created;
  }

  async removeEntry(name: string): Promise<void> {
    checkName(name);
    const entry = this.entries.get(name);
    if (!entry) throw notFound(name);
    if (entry instanceof MemoryDirectoryHandle && entry.entries.size > 0) {
      throw new DOMException(`${name} is not empty`, 'InvalidModificationError');
    }
    if (entry instanceof MemoryFileHandle) this.quota.used -= entry.size;
    this.entries.delete(name);
  }

  async *values(): AsyncGenerator<MemoryDirectoryHandle | MemoryFileHandle> {
    yield* [...this.entries.values()];
  }

  /** Test helper: every file path under this directory, sorted. */
  paths(prefix = ''): string[] {
    const result: string[] = [];
    for (const [name, entry] of this.entries) {
      if (entry instanceof MemoryDirectoryHandle) result.push(...entry.paths(`${prefix}${name}/`));
      else result.push(`${prefix}${name}`);
    }
    return result.sort();
  }
}

export interface MemoryDirectory {
  /** The fake, typed as the real handle so it can be passed to `createOpfsStore`. */
  handle: FileSystemDirectoryHandle;
  /** Every stored file path, e.g. `['assets/abc', 'thumbs/abc.webp']`. */
  paths(): string[];
  /** Bytes currently stored. */
  usedBytes(): number;
}

export function createMemoryDirectory(options: MemoryDirectoryOptions = {}): MemoryDirectory {
  const quota: Quota = { limit: options.quotaBytes ?? Number.POSITIVE_INFINITY, used: 0 };
  const root = new MemoryDirectoryHandle('', quota, options.now ?? Date.now);
  return {
    handle: root as unknown as FileSystemDirectoryHandle,
    paths: () => root.paths(),
    usedBytes: () => quota.used,
  };
}

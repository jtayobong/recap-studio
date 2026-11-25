import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_LIMITS } from '../domain/asset';
import { createAssetRepository, type AssetRepository } from '../db/assetRepository';
import { EditorDatabase } from '../db/database';
import { createOpfsStore } from '../db/opfsStore';
import { createMemoryDirectory, type MemoryDirectory } from '../db/testing/memoryDirectory';
import { fitWithin, reencodeMimeType } from './browserProbe';
import { createImporter, ImportError, STORAGE_MARGIN_BYTES, type ImportDependencies, type MediaProbe } from './importAsset';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MP4 = [0, 0, 0, 0x20, ...'ftypisom'].map((b) => (typeof b === 'string' ? b.charCodeAt(0) : b));

const pngFile = (name = 'photo.png', extra = 100) => new File([new Uint8Array([...PNG, ...new Array<number>(extra).fill(1)])], name);
const mp4File = (name = 'clip.mp4') => new File([new Uint8Array([...MP4, ...new Array<number>(200).fill(2)])], name);

/** A file that reports a huge size without allocating it. */
function fakeSizedFile(header: number[], size: number, name: string): File {
  const file = new File([new Uint8Array(header)], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

let database: EditorDatabase;
let dir: MemoryDirectory;
let assets: AssetRepository;
let probe: { image: ReturnType<typeof vi.fn<MediaProbe['image']>>; video: ReturnType<typeof vi.fn<MediaProbe['video']>> };

beforeEach(() => {
  database = new EditorDatabase(`test-${crypto.randomUUID()}`);
  dir = createMemoryDirectory();
  assets = createAssetRepository(database, createOpfsStore(async () => dir.handle));
  probe = {
    image: vi.fn<MediaProbe['image']>(async (file, mime) => ({ width: 640, height: 480, data: file, mime, thumbnail: new Blob(['t']) })),
    video: vi.fn<MediaProbe['video']>(async () => ({ width: 1080, height: 1920, durationMs: 12_345, thumbnail: new Blob(['t']) })),
  };
});

afterEach(async () => {
  await database.delete();
});

function importer(overrides: Partial<ImportDependencies> = {}) {
  return createImporter({ assets, probe, ...overrides });
}

async function expectImportError(promise: Promise<unknown>, reason: ImportError['reason']) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ImportError);
  expect((error as ImportError).reason).toBe(reason);
  return error as ImportError;
}

describe('importer', () => {
  it('imports an image with metadata, data and thumbnail', async () => {
    const phases: string[] = [];
    const asset = await importer().importFile(pngFile(), 'p1', { onProgress: (p) => phases.push(p.phase) });
    expect(asset).toMatchObject({ projectId: 'p1', kind: 'image', mime: 'image/png', filename: 'photo.png', width: 640, height: 480, bytes: 108 });
    expect(await assets.readThumbnail(asset.id)).toBeDefined();
    expect([...new Set(phases)]).toEqual(['checking', 'processing', 'saving']);
  });

  it('stores what the probe returns (e.g. a downscaled re-encode)', async () => {
    probe.image.mockResolvedValueOnce({ width: 2160, height: 1620, data: new Blob(['small']), mime: 'image/jpeg' });
    const asset = await importer().importFile(pngFile(), 'p1');
    expect(asset).toMatchObject({ mime: 'image/jpeg', width: 2160, bytes: 5 });
  });

  it('imports a video by streaming the original file', async () => {
    const progress: number[] = [];
    const file = mp4File();
    const asset = await importer().importFile(file, 'p1', {
      onProgress: (p) => p.fraction !== undefined && progress.push(p.fraction),
    });
    expect(asset).toMatchObject({ kind: 'video', mime: 'video/mp4', durationMs: 12_345, width: 1080, bytes: file.size });
    expect(progress.at(-1)).toBe(1);
  });

  it('decides the format from content, not the name', async () => {
    const asset = await importer().importFile(pngFile('actually-a-png.mp4'), 'p1');
    expect(asset.kind).toBe('image');
    await expectImportError(importer().importFile(new File(['<svg></svg>'], 'x.png', { type: 'image/png' }), 'p1'), 'unsupported');
    expect(probe.image).toHaveBeenCalledOnce();
  });

  it('enforces size limits before decoding', async () => {
    const big = fakeSizedFile(PNG, MEDIA_LIMITS.image.maxBytes + 1, 'huge.png');
    const error = await expectImportError(importer().importFile(big, 'p1'), 'too-large');
    expect(error.message).toBe('“huge.png” is 80.0 MB. Images can be up to 80.0 MB.');
    await expectImportError(importer().importFile(fakeSizedFile(MP4, MEDIA_LIMITS.video.maxBytes + 1, 'huge.mp4'), 'p1'), 'too-large');
    expect(probe.image).not.toHaveBeenCalled();
    expect(probe.video).not.toHaveBeenCalled();
  });

  it('enforces the video length limit', async () => {
    probe.video.mockResolvedValueOnce({ width: 10, height: 10, durationMs: 5 * 60_000 + 600 });
    const error = await expectImportError(importer().importFile(mp4File(), 'p1'), 'too-long');
    expect(error.message).toBe('“clip.mp4” is 5:01 long. Videos can be up to 5:00.');
  });

  it('accepts a video exactly at the length limit', async () => {
    probe.video.mockResolvedValueOnce({ width: 10, height: 10, durationMs: 5 * 60_000 });
    await expect(importer().importFile(mp4File(), 'p1')).resolves.toMatchObject({ durationMs: 300_000 });
  });

  it('reports decode failures as unreadable', async () => {
    probe.image.mockRejectedValueOnce(new DOMException('bad', 'InvalidStateError'));
    const error = await expectImportError(importer().importFile(pngFile(), 'p1'), 'unreadable');
    expect(error.message).toMatch(/couldn’t be decoded/);
    probe.video.mockRejectedValueOnce(new Error('codec'));
    expect((await expectImportError(importer().importFile(mp4File(), 'p1'), 'unreadable')).message).toMatch(/can’t be played/);
  });

  it('passes through probe ImportErrors', async () => {
    probe.video.mockRejectedValueOnce(new ImportError('unsupported', 'No picture.'));
    expect((await expectImportError(importer().importFile(mp4File(), 'p1'), 'unsupported')).message).toBe('No picture.');
  });

  it('checks free storage before writing', async () => {
    const estimateStorage = async () => ({ usage: 0, quota: STORAGE_MARGIN_BYTES + 50 });
    await expectImportError(importer({ estimateStorage }).importFile(pngFile(), 'p1'), 'storage-full');
    expect(dir.paths()).toEqual([]);
  });

  it('carries on when the storage estimate is unavailable', async () => {
    const estimateStorage = async () => {
      throw new Error('nope');
    };
    await expect(importer({ estimateStorage }).importFile(pngFile(), 'p1')).resolves.toBeDefined();
    await expect(importer({ estimateStorage: async () => undefined }).importFile(pngFile(), 'p1')).resolves.toBeDefined();
  });

  it('maps a full disk during the write to storage-full', async () => {
    dir = createMemoryDirectory({ quotaBytes: 50 });
    assets = createAssetRepository(database, createOpfsStore(async () => dir.handle));
    const error = await expectImportError(importer().importFile(pngFile(), 'p1'), 'storage-full');
    expect(error.message).toMatch(/Not enough storage space/);
  });

  it('requests persistent storage once, and survives it failing', async () => {
    const requestPersistence = vi.fn(async () => {
      throw new Error('denied');
    });
    const imp = importer({ requestPersistence });
    await imp.importFile(pngFile(), 'p1');
    await imp.importFile(pngFile(), 'p1');
    expect(requestPersistence).toHaveBeenCalledOnce();
  });

  it('does not request persistence when nothing gets stored', async () => {
    const requestPersistence = vi.fn(async () => true);
    await expectImportError(importer({ requestPersistence }).importFile(new File(['nope'], 'a.txt'), 'p1'), 'unsupported');
    expect(requestPersistence).not.toHaveBeenCalled();
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expectImportError(importer().importFile(pngFile(), 'p1', { signal: controller.signal }), 'cancelled');

    const during = new AbortController();
    const imp = importer();
    const pending = imp.importFile(mp4File(), 'p1', {
      signal: during.signal,
      onProgress: (p) => p.phase === 'saving' && during.abort(),
    });
    await expectImportError(pending, 'cancelled');
    expect(dir.paths()).toEqual([]);
  });

  describe('importFiles', () => {
    it('imports what it can and reports the rest', async () => {
      const started: string[] = [];
      const result = await importer().importFiles([pngFile('a.png'), new File(['x'], 'notes.txt'), mp4File('b.mp4')], 'p1', {
        onFileStart: (file) => started.push(file.name),
      });
      expect(started).toEqual(['a.png', 'notes.txt', 'b.mp4']);
      expect(result.imported.map((a) => a.filename)).toEqual(['a.png', 'b.mp4']);
      expect(result.failed.map((f) => [f.filename, f.error.reason])).toEqual([['notes.txt', 'unsupported']]);
    });

    it('stops at a cancel', async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await importer().importFiles([pngFile('a.png'), pngFile('b.png')], 'p1', { signal: controller.signal });
      expect(result.failed.map((f) => f.filename)).toEqual(['a.png']);
    });
  });
});

describe('browserProbe helpers', () => {
  it('fitWithin only scales down and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 2160)).toEqual({ width: 2160, height: 1620 });
    expect(fitWithin(1080, 1920, 480)).toEqual({ width: 270, height: 480 });
    expect(fitWithin(100, 50, 2160)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(10_000, 1, 480)).toEqual({ width: 480, height: 1 });
  });

  it('re-encodes GIF and PNG as PNG, keeps JPEG and WebP', () => {
    expect(reencodeMimeType('image/gif')).toBe('image/png');
    expect(reencodeMimeType('image/png')).toBe('image/png');
    expect(reencodeMimeType('image/jpeg')).toBe('image/jpeg');
    expect(reencodeMimeType('image/webp')).toBe('image/webp');
  });
});

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetDataError, createAssetRepository, ORPHAN_MIN_AGE_MS, type AssetRepository, type NewAssetInput } from './assetRepository';
import { EditorDatabase } from './database';
import { createOpfsStore, StorageFullError } from './opfsStore';
import { createMemoryDirectory, type MemoryDirectory } from './testing/memoryDirectory';

let database: EditorDatabase;
let dir: MemoryDirectory;
let repo: AssetRepository;
let clock: number;

function setup(quotaBytes?: number) {
  dir = createMemoryDirectory({ quotaBytes, now: () => clock });
  repo = createAssetRepository(database, createOpfsStore(async () => dir.handle), { now: () => clock });
}

beforeEach(() => {
  database = new EditorDatabase(`test-${crypto.randomUUID()}`);
  clock = 1_000;
  setup();
});

afterEach(async () => {
  await database.delete();
});

const image = (projectId: string, overrides: Partial<NewAssetInput> = {}): NewAssetInput => ({
  projectId,
  kind: 'image',
  mime: 'image/png',
  filename: 'photo.png',
  width: 4,
  height: 3,
  data: new Blob(['image-bytes']),
  thumbnail: new Blob(['thumb']),
  ...overrides,
});

describe('assetRepository', () => {
  it('adds an asset: file, thumbnail and validated row', async () => {
    const asset = await repo.add(image('p1', { filename: 'C:\\pics\\photo.png' }));
    expect(asset).toMatchObject({ projectId: 'p1', kind: 'image', filename: 'photo.png', bytes: 11, createdAt: 1_000 });
    expect(await repo.get(asset.id)).toEqual(asset);
    expect(await (await repo.readFile(asset.id))?.text()).toBe('image-bytes');
    const thumb = await repo.readThumbnail(asset.id);
    expect(thumb?.type).toBe('image/webp');
    expect(await thumb?.text()).toBe('thumb');
    expect(dir.paths()).toEqual([`assets/${asset.id}`, `thumbs/${asset.id}.webp`]);
  });

  it('reports progress while writing', async () => {
    const progress: number[] = [];
    await repo.add(image('p1'), { onProgress: (n) => progress.push(n) });
    expect(progress.at(-1)).toBe(11);
  });

  it('works without a thumbnail', async () => {
    const asset = await repo.add(image('p1', { thumbnail: undefined }));
    expect(await repo.readThumbnail(asset.id)).toBeUndefined();
  });

  it('rejects invalid metadata before writing anything', async () => {
    await expect(repo.add(image('p1', { kind: 'video' }))).rejects.toBeInstanceOf(AssetDataError);
    await expect(repo.add(image('p1', { width: 0 }))).rejects.toBeInstanceOf(AssetDataError);
    expect(dir.paths()).toEqual([]);
    expect(await database.assets.count()).toBe(0);
  });

  it('leaves nothing behind when storage is full', async () => {
    setup(5);
    await expect(repo.add(image('p1'))).rejects.toBeInstanceOf(StorageFullError);
    expect(dir.paths()).toEqual([]);
    expect(await database.assets.count()).toBe(0);
  });

  it('removes the binary if the thumbnail write fails', async () => {
    setup(13); // room for the 11-byte binary but not the 5-byte thumbnail
    await expect(repo.add(image('p1'))).rejects.toBeInstanceOf(StorageFullError);
    expect(dir.paths()).toEqual([]);
  });

  it('lists a project\'s assets oldest first, skipping invalid rows', async () => {
    const a = await repo.add(image('p1'));
    clock += 10;
    const b = await repo.add(image('p1', { filename: 'second.png' }));
    await repo.add(image('p2'));
    await database.assets.put({ id: 'bad', projectId: 'p1', createdAt: 5, kind: 'nope' });

    expect((await repo.listForProject('p1')).map((x) => x.id)).toEqual([a.id, b.id]);
    expect(await repo.get('bad')).toBeUndefined();
    expect(await repo.listForProject('none')).toEqual([]);
  });

  it('removes an asset and its files', async () => {
    const asset = await repo.add(image('p1'));
    await repo.remove(asset.id);
    expect(await repo.get(asset.id)).toBeUndefined();
    expect(await repo.readFile(asset.id)).toBeUndefined();
    expect(dir.paths()).toEqual([]);
    await repo.remove(asset.id); // idempotent
  });

  it('deletes all assets of one project only', async () => {
    await repo.add(image('p1'));
    await repo.add(image('p1'));
    const other = await repo.add(image('p2'));

    expect(await repo.deleteForProject('p1')).toBe(2);
    expect(await repo.listForProject('p1')).toEqual([]);
    expect(dir.paths()).toEqual([`assets/${other.id}`, `thumbs/${other.id}.webp`]);
  });

  describe('copyProjectAssets', () => {
    it('copies files and rows under new ids', async () => {
      const a = await repo.add(image('p1'));
      const idMap = await repo.copyProjectAssets('p1', 'p2');

      const copyId = idMap.get(a.id);
      expect(copyId).toBeDefined();
      expect(copyId).not.toBe(a.id);
      const copy = await repo.get(copyId ?? '');
      expect(copy).toEqual({ ...a, id: copyId, projectId: 'p2' });
      expect(await (await repo.readFile(copyId ?? ''))?.text()).toBe('image-bytes');
      expect(await (await repo.readThumbnail(copyId ?? ''))?.text()).toBe('thumb');

      // Independent: deleting the original keeps the copy.
      await repo.deleteForProject('p1');
      expect(await (await repo.readFile(copyId ?? ''))?.text()).toBe('image-bytes');
    });

    it('maps assets with missing files to fresh ids without rows', async () => {
      const a = await repo.add(image('p1'));
      await createOpfsStore(async () => dir.handle).remove('assets', a.id);
      const idMap = await repo.copyProjectAssets('p1', 'p2');
      expect(idMap.get(a.id)).toBeDefined();
      expect(await repo.listForProject('p2')).toEqual([]);
    });

    it('rolls back on failure', async () => {
      setup(40);
      await repo.add(image('p1')); // 16 bytes
      await repo.add(image('p1')); // 32 bytes; copying both would need 64
      await expect(repo.copyProjectAssets('p1', 'p2')).rejects.toBeInstanceOf(StorageFullError);
      expect(await repo.listForProject('p2')).toEqual([]);
      expect(dir.paths()).toHaveLength(4);
      expect(dir.usedBytes()).toBe(32);
    });
  });

  describe('sweepOrphans', () => {
    it('removes rows of deleted projects and old files without rows', async () => {
      const kept = await repo.add(image('live'));
      await repo.add(image('gone'));
      const store = createOpfsStore(async () => dir.handle);
      await store.write('assets', 'stray-old', new Blob(['x']));
      await store.write('thumbs', 'stray-old.webp', new Blob(['x']));
      clock += ORPHAN_MIN_AGE_MS + 1;
      await store.write('assets', 'stray-new', new Blob(['x']));

      const result = await repo.sweepOrphans(new Set(['live']));
      expect(result).toEqual({ rowsRemoved: 1, filesRemoved: 2 });
      expect(dir.paths()).toEqual([`assets/${kept.id}`, 'assets/stray-new', `thumbs/${kept.id}.webp`]);
    });

    it('never sweeps a file that is still being written', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let sent = false;
      const slow = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (sent) return controller.close();
          await gate;
          sent = true;
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
      });

      const adding = repo.add(image('live', { data: slow, thumbnail: undefined }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      clock += ORPHAN_MIN_AGE_MS * 2;
      expect(await repo.sweepOrphans(new Set(['live']))).toEqual({ rowsRemoved: 0, filesRemoved: 0 });

      release();
      const asset = await adding;
      expect((await repo.readFile(asset.id))?.size).toBe(3);
    });
  });
});

describe('EditorDatabase upgrade', () => {
  it('keeps v1 projects when adding the assets table', async () => {
    const name = `upgrade-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ projects: 'id, updatedAt' });
    await v1.table('projects').put({ id: 'p1', updatedAt: 1, name: 'Old' });
    v1.close();

    const upgraded = new EditorDatabase(name);
    expect(await upgraded.projects.get('p1')).toMatchObject({ name: 'Old' });
    expect(await upgraded.assets.count()).toBe(0);
    expect(upgraded.verno).toBe(2);
    await upgraded.delete();
  });
});

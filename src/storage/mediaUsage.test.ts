import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssetRepository, type AssetRepository } from '../db/assetRepository';
import { EditorDatabase } from '../db/database';
import { createOpfsStore } from '../db/opfsStore';
import { createProjectRepository, type ProjectRepository } from '../db/projectRepository';
import { createMemoryDirectory } from '../db/testing/memoryDirectory';
import { createScene } from '../render/templates/registry';
import { freeBytes, isStorageLow, LOW_FREE_BYTES } from '../lib/storage';
import { deleteMedia, deleteUnusedMedia, getMediaUsage } from './mediaUsage';

let database: EditorDatabase;
let assets: AssetRepository;
let projects: ProjectRepository;
const deps = () => ({ projects, assets });

beforeEach(() => {
  database = new EditorDatabase(`test-${crypto.randomUUID()}`);
  const files = createMemoryDirectory();
  assets = createAssetRepository(database, createOpfsStore(async () => files.handle));
  projects = createProjectRepository(database, assets);
});

afterEach(async () => {
  await database.delete();
});

const add = (projectId: string, filename: string, size: number) =>
  assets.add({ projectId, kind: 'image', mime: 'image/png', filename, data: new Blob([new Uint8Array(size)]) });

async function setup() {
  const a = await projects.create({ name: 'Alpha' });
  const b = await projects.create({ name: 'Beta' });
  const big = await add(a.id, 'big.png', 3000);
  const small = await add(a.id, 'small.png', 100);
  const spare = await add(b.id, 'spare.png', 2000);
  const photo = createScene('photo');
  await projects.save({ ...a, scenes: [{ ...photo, fields: { ...photo.fields, media: big.id } }] });
  return { a, b, big, small, spare };
}

describe('getMediaUsage', () => {
  it('totals per project, lists media largest first, and marks what is used', async () => {
    const { a, small, spare } = await setup();
    const usage = await getMediaUsage(deps());
    expect(usage.totalBytes).toBe(5100);
    expect(usage.items.map((i) => [i.asset.filename, i.projectName, i.used])).toEqual([
      ['big.png', 'Alpha', true],
      ['spare.png', 'Beta', false],
      ['small.png', 'Alpha', false],
    ]);
    expect(usage.projects).toEqual([
      { id: a.id, name: 'Alpha', count: 2, bytes: 3100 },
      expect.objectContaining({ name: 'Beta', count: 1, bytes: 2000 }),
    ]);
    expect(usage.unused).toEqual({ count: 2, bytes: spare.bytes + small.bytes });
  });

  it('treats media of a project that can’t be opened as in use', async () => {
    const { b } = await setup();
    await database.projects.put({ id: b.id, updatedAt: 9, schemaVersion: 99 });
    const usage = await getMediaUsage(deps());
    expect(usage.items.find((i) => i.asset.filename === 'spare.png')?.used).toBe(true);
  });
});

describe('cleanup', () => {
  it('deleting used media empties the scenes that used it', async () => {
    const { a, big } = await setup();
    await deleteMedia(big.id, deps());
    expect(await assets.get(big.id)).toBeUndefined();
    expect((await projects.get(a.id))?.scenes[0]?.fields.media).toBe('');
  });

  it('deleting unused media keeps what is in use', async () => {
    const { big } = await setup();
    expect(await deleteUnusedMedia(deps())).toEqual({ count: 2, bytes: 2100 });
    expect((await assets.listAll()).map((x) => x.id)).toEqual([big.id]);
  });
});

describe('storage warnings', () => {
  const info = (usage: number | null, quota: number | null) => ({ usageBytes: usage, quotaBytes: quota, persisted: null });
  it('warns when little is free or most of the quota is used; never on unknown estimates', () => {
    const GB = 1024 ** 3;
    expect(isStorageLow(info(1 * GB, 100 * GB))).toBe(false);
    expect(isStorageLow(info(99.5 * GB, 100 * GB))).toBe(true); // < 1 GB free
    expect(isStorageLow(info(1.8 * GB, 2 * GB))).toBe(true); // 90 % used
    expect(isStorageLow(info(null, 100 * GB))).toBe(false);
    expect(freeBytes(info(GB, GB + LOW_FREE_BYTES))).toBe(LOW_FREE_BYTES);
  });
});

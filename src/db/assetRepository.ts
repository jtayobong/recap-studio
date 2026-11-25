import Dexie from 'dexie';
import { AssetSchema, normalizeFilename, type Asset, type AssetKind, type SupportedMimeType } from '../domain/asset';
import { newId } from '../lib/ids';
import type { EditorDatabase, StoredAsset } from './database';
import type { BlobStore, WriteOptions } from './opfsStore';

export const ASSETS_DIR = 'assets';
export const THUMBS_DIR = 'thumbs';
const thumbName = (id: string) => `${id}.webp`;

/**
 * Files without a metadata row are only swept once they are this old, so a sweep can't race an
 * import that is still writing in another tab.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60_000;

export interface NewAssetInput {
  projectId: string;
  kind: AssetKind;
  mime: SupportedMimeType;
  filename: string;
  width?: number;
  height?: number;
  durationMs?: number;
  /** The (already validated and, for images, downscaled) binary. Streamed to OPFS. */
  data: Blob | ReadableStream<Uint8Array>;
  /** Small WebP preview for the library and inspector. */
  thumbnail?: Blob;
}

export class AssetDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetDataError';
  }
}

export interface SweepResult {
  rowsRemoved: number;
  filesRemoved: number;
}

function parseRow(row: StoredAsset | undefined): Asset | undefined {
  if (row === undefined) return undefined;
  const result = AssetSchema.safeParse(row);
  return result.success ? result.data : undefined;
}

/**
 * All media persistence goes through here: asset rows in IndexedDB and binaries in OPFS.
 * Nothing else touches the `assets` table or the file store (invariant 3).
 *
 * Write order keeps rows trustworthy: files are written first and the row last, so a row never
 * points at a half-written file. A crash between the two leaves an orphaned file, which
 * `sweepOrphans` removes later. Deletes remove the row first, then the files.
 */
export function createAssetRepository(
  database: EditorDatabase,
  store: BlobStore,
  options: { now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  /** Ids whose files are being written by this instance; never swept. */
  const inFlight = new Set<string>();

  async function removeFiles(id: string): Promise<void> {
    await Promise.all([store.remove(ASSETS_DIR, id), store.remove(THUMBS_DIR, thumbName(id))]);
  }

  async function add(input: NewAssetInput, writeOptions: WriteOptions = {}): Promise<Asset> {
    const id = newId();
    const draft = {
      id,
      projectId: input.projectId,
      kind: input.kind,
      mime: input.mime,
      filename: normalizeFilename(input.filename),
      bytes: 0,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      createdAt: now(),
    };
    // Validate metadata before writing anything.
    const checked = AssetSchema.safeParse(draft);
    if (!checked.success) {
      throw new AssetDataError(`Invalid media metadata: ${checked.error.issues[0]?.message ?? 'unknown issue'}`);
    }

    inFlight.add(id);
    try {
      const bytes = await store.write(ASSETS_DIR, id, input.data, writeOptions);
      if (input.thumbnail) await store.write(THUMBS_DIR, thumbName(id), input.thumbnail, { signal: writeOptions.signal });
      const asset: Asset = { ...checked.data, bytes };
      await database.assets.add(asset);
      return asset;
    } catch (error) {
      await removeFiles(id).catch(() => undefined);
      throw error;
    } finally {
      inFlight.delete(id);
    }
  }

  async function get(id: string): Promise<Asset | undefined> {
    return parseRow(await database.assets.get(id));
  }

  /** Assets of one project, oldest first. Rows that fail validation are skipped. */
  async function listForProject(projectId: string): Promise<Asset[]> {
    const rows = await database.assets
      .where('[projectId+createdAt]')
      .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
      .toArray();
    return rows.map(parseRow).filter((asset): asset is Asset => asset !== undefined);
  }

  /** The stored binary, or undefined if the file is missing (e.g. cleared by the browser). */
  async function readFile(id: string): Promise<File | undefined> {
    return store.read(ASSETS_DIR, id);
  }

  async function readThumbnail(id: string): Promise<Blob | undefined> {
    const file = await store.read(THUMBS_DIR, thumbName(id));
    return file === undefined ? undefined : new Blob([file], { type: 'image/webp' });
  }

  async function remove(id: string): Promise<void> {
    await database.assets.delete(id);
    await removeFiles(id);
  }

  /** Deletes every asset of a project (rows, binaries and thumbnails). Returns how many. */
  async function deleteForProject(projectId: string): Promise<number> {
    const ids = (await database.assets.where('projectId').equals(projectId).primaryKeys()) as string[];
    await database.assets.bulkDelete(ids);
    for (const id of ids) await removeFiles(id);
    return ids.length;
  }

  /**
   * Copies all assets of one project to another under new ids, for project duplication.
   * Returns old id → new id. An asset whose file is missing still gets a new id (with no row), so
   * the copy shows it as missing instead of reaching into the original project.
   * On failure, everything copied so far is removed.
   */
  async function copyProjectAssets(fromProjectId: string, toProjectId: string): Promise<Map<string, string>> {
    const idMap = new Map<string, string>();
    const written: string[] = [];
    try {
      for (const asset of await listForProject(fromProjectId)) {
        const copyId = newId();
        idMap.set(asset.id, copyId);
        const file = await readFile(asset.id);
        if (!file) continue;

        inFlight.add(copyId);
        written.push(copyId);
        await store.write(ASSETS_DIR, copyId, file);
        const thumbnail = await store.read(THUMBS_DIR, thumbName(asset.id));
        if (thumbnail) await store.write(THUMBS_DIR, thumbName(copyId), thumbnail);
        await database.assets.add({ ...asset, id: copyId, projectId: toProjectId });
      }
      return idMap;
    } catch (error) {
      await database.assets.bulkDelete(written).catch(() => undefined);
      for (const id of written) await removeFiles(id).catch(() => undefined);
      throw error;
    } finally {
      for (const id of written) inFlight.delete(id);
    }
  }

  /**
   * Removes leftovers: asset rows whose project no longer exists, and files with no asset row
   * (older than ORPHAN_MIN_AGE_MS, so in-progress imports elsewhere are safe).
   * Rows whose file is missing are kept; the library shows them as "missing file".
   */
  async function sweepOrphans(liveProjectIds: ReadonlySet<string>): Promise<SweepResult> {
    let rowsRemoved = 0;
    const projectIds = (await database.assets.orderBy('projectId').uniqueKeys()) as string[];
    for (const projectId of projectIds) {
      if (!liveProjectIds.has(projectId)) rowsRemoved += await deleteForProject(projectId);
    }

    const knownIds = new Set((await database.assets.toCollection().primaryKeys()) as string[]);
    const cutoff = now() - ORPHAN_MIN_AGE_MS;
    let filesRemoved = 0;
    const sweepDir = async (dir: string, idOf: (name: string) => string) => {
      for (const file of await store.list(dir)) {
        const id = idOf(file.name);
        if (knownIds.has(id) || inFlight.has(id) || file.lastModified > cutoff) continue;
        await store.remove(dir, file.name);
        filesRemoved += 1;
      }
    };
    await sweepDir(ASSETS_DIR, (name) => name);
    await sweepDir(THUMBS_DIR, (name) => name.replace(/\.webp$/, ''));
    return { rowsRemoved, filesRemoved };
  }

  return {
    add,
    get,
    listForProject,
    readFile,
    readThumbnail,
    remove,
    deleteForProject,
    copyProjectAssets,
    sweepOrphans,
  };
}

export type AssetRepository = ReturnType<typeof createAssetRepository>;

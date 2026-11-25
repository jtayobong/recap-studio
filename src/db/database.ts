import Dexie, { type Table } from 'dexie';

/**
 * What actually sits in IndexedDB. Rows may be from an older schema version,
 * so they are typed loosely and always pass through `migrateProject` on read.
 */
export type StoredProject = { id: string; updatedAt: number } & Record<string, unknown>;

/** Asset metadata rows. Untrusted on read: validated with `AssetSchema` by the asset repository. */
export type StoredAsset = { id: string; projectId: string; createdAt: number } & Record<string, unknown>;

export class EditorDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  assets!: Table<StoredAsset, string>;

  constructor(name = 'recap-studio') {
    super(name);
    // IndexedDB schema (indexes only). Separate from the project document's schemaVersion.
    this.version(1).stores({
      projects: 'id, updatedAt',
    });
    // v2 (M4): media asset metadata. Binaries live in OPFS, not here.
    this.version(2).stores({
      projects: 'id, updatedAt',
      assets: 'id, projectId, [projectId+createdAt]',
    });
  }
}

import Dexie, { type Table } from 'dexie';

/**
 * What actually sits in IndexedDB. Rows may be from an older schema version,
 * so they are typed loosely and always pass through `migrateProject` on read.
 */
export type StoredProject = { id: string; updatedAt: number } & Record<string, unknown>;

export class EditorDatabase extends Dexie {
  projects!: Table<StoredProject, string>;

  constructor(name = 'recap-studio') {
    super(name);
    // IndexedDB schema (indexes only). Separate from the project document's schemaVersion.
    // Media assets get their own table in M4; binaries live in OPFS, not here.
    this.version(1).stores({
      projects: 'id, updatedAt',
    });
  }
}

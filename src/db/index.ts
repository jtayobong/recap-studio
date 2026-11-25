import { createAssetRepository } from './assetRepository';
import { EditorDatabase } from './database';
import { createOpfsStore } from './opfsStore';
import { createProjectRepository } from './projectRepository';

/** App-wide singletons. Tests create their own instances instead of importing these. */
export const database = new EditorDatabase();
export const assetRepository = createAssetRepository(database, createOpfsStore());
export const projectRepository = createProjectRepository(database, assetRepository);

/** Removes media left behind by interrupted imports or failed deletes. Safe to call any time. */
export async function sweepOrphanedMedia() {
  return assetRepository.sweepOrphans(await projectRepository.ids());
}

let sweepStarted = false;

/** Runs the sweep at most once per page load, ignoring failures (it is housekeeping only). */
export function sweepOrphanedMediaOnce(): void {
  if (sweepStarted) return;
  sweepStarted = true;
  sweepOrphanedMedia().catch(() => undefined);
}

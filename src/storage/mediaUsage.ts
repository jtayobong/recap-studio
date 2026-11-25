import { clearAssetReferences, countAssetReferences, type Asset } from '../domain/asset';
import type { AssetRepository } from '../db/assetRepository';
import type { ProjectRepository } from '../db/projectRepository';

/**
 * What media takes space, and cleanup (the Storage page). Works only through the repositories
 * (CLAUDE.md invariant 3). Media of a project that can't be opened counts as in use, so cleanup
 * never deletes it.
 */

export type MediaUsageDeps = {
  projects: Pick<ProjectRepository, 'list' | 'get' | 'save'>;
  assets: Pick<AssetRepository, 'listAll' | 'get' | 'remove'>;
};

export interface MediaItem {
  asset: Asset;
  projectName: string;
  /** Referenced by a scene or the music (or its project can't be opened). */
  used: boolean;
}

export interface MediaUsage {
  totalBytes: number;
  projects: { id: string; name: string; count: number; bytes: number }[];
  /** Largest first. */
  items: MediaItem[];
  unused: { count: number; bytes: number };
}

export async function getMediaUsage(deps: MediaUsageDeps): Promise<MediaUsage> {
  const [{ projects, broken }, assets] = await Promise.all([deps.projects.list(), deps.assets.listAll()]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  for (const b of broken) names.set(b.id, 'Project that can’t be opened');

  const usedIds = new Set<string>();
  const brokenIds = new Set(broken.map((b) => b.id));
  const byProject = new Map<string, Asset[]>();
  for (const asset of assets) byProject.set(asset.projectId, [...(byProject.get(asset.projectId) ?? []), asset]);
  for (const [projectId, list] of byProject) {
    if (brokenIds.has(projectId)) {
      list.forEach((a) => usedIds.add(a.id));
      continue;
    }
    const project = await deps.projects.get(projectId).catch(() => undefined);
    if (!project) continue; // orphaned rows: unused (the sweep removes them too)
    for (const [id, count] of countAssetReferences(project, list.map((a) => a.id))) if (count > 0) usedIds.add(id);
  }

  const items = assets
    .map((asset) => ({ asset, projectName: names.get(asset.projectId) ?? 'Deleted project', used: usedIds.has(asset.id) }))
    .sort((a, b) => b.asset.bytes - a.asset.bytes);
  const perProject = [...byProject.entries()]
    .map(([id, list]) => ({ id, name: names.get(id) ?? 'Deleted project', count: list.length, bytes: list.reduce((sum, a) => sum + a.bytes, 0) }))
    .sort((a, b) => b.bytes - a.bytes);
  const unusedItems = items.filter((i) => !i.used);
  return {
    totalBytes: assets.reduce((sum, a) => sum + a.bytes, 0),
    projects: perProject,
    items,
    unused: { count: unusedItems.length, bytes: unusedItems.reduce((sum, i) => sum + i.asset.bytes, 0) },
  };
}

/** Delete one media item; scenes (and the music) that used it are emptied in its project. */
export async function deleteMedia(assetId: string, deps: MediaUsageDeps): Promise<void> {
  const asset = await deps.assets.get(assetId);
  if (asset) {
    const project = await deps.projects.get(asset.projectId).catch(() => undefined);
    if (project) {
      const cleaned = clearAssetReferences(project, assetId);
      if (cleaned !== project) await deps.projects.save(cleaned);
    }
  }
  await deps.assets.remove(assetId);
}

/** Delete every unused media item. Returns how many and how much space was freed. */
export async function deleteUnusedMedia(deps: MediaUsageDeps): Promise<{ count: number; bytes: number }> {
  const usage = await getMediaUsage(deps);
  const unused = usage.items.filter((i) => !i.used);
  for (const item of unused) await deps.assets.remove(item.asset.id);
  return usage.unused;
}

import { AssetIdSchema } from '../domain/asset';
import type { Project } from '../domain/project';
import { getTemplate } from '../render/templates/registry';

/** Asset ids referenced by media fields of the project's scenes (and the audio track, for M6). */
export function mediaAssetIds(project: Pick<Project, 'scenes' | 'audio'>): Set<string> {
  const ids = new Set<string>();
  for (const scene of project.scenes) {
    const template = getTemplate(scene.templateId);
    if (!template) continue;
    for (const [key, def] of Object.entries(template.fields)) {
      const value = scene.fields[key];
      if (def.kind === 'media' && typeof value === 'string' && AssetIdSchema.safeParse(value).success) ids.add(value);
    }
  }
  if (project.audio) ids.add(project.audio.assetId);
  return ids;
}

/** Number of scenes whose media slots point at any of `missingIds`. */
export function scenesWithMissingMedia(project: Pick<Project, 'scenes'>, missingIds: ReadonlySet<string>): number {
  return project.scenes.filter((scene) => Object.values(scene.fields).some((v) => typeof v === 'string' && missingIds.has(v))).length;
}

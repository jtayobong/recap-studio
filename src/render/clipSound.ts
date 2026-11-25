import type { AssetKind } from '../domain/asset';
import type { SoundSegment } from '../domain/music';
import type { Scene } from '../domain/project';
import { getSceneSpans } from './timeline';
import { getTemplate } from './templates/registry';

/** Template field that turns a scene's clip sound on (a `boolean`, default off). */
export const CLIP_SOUND_FIELD = 'clipSound';

export type AssetLookup = (assetId: string) => { kind: AssetKind; durationMs?: number } | undefined;

/**
 * When video clips are heard with their own sound, in story time. A scene with "Keep clip sound"
 * on plays each of its video clips from the clip's start, for the length of the scene (shorter if
 * the clip ends first): templates draw clips at clip time = scene-local time, so picture and sound
 * line up. Photos and unknown assets make no sound. Used by both the preview and the export, so
 * they duck the music and play clip sound at the same moments.
 */
export function soundSegments(scenes: readonly Scene[], lookup: AssetLookup): SoundSegment[] {
  const segments: SoundSegment[] = [];
  for (const span of getSceneSpans(scenes)) {
    const { scene } = span;
    if (scene.fields[CLIP_SOUND_FIELD] !== true) continue;
    const template = getTemplate(scene.templateId);
    if (!template) continue;
    const seen = new Set<string>();
    for (const [key, def] of Object.entries(template.fields)) {
      const assetId = scene.fields[key];
      if (def.kind !== 'media' || typeof assetId !== 'string' || !assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      const asset = lookup(assetId);
      if (asset?.kind !== 'video') continue;
      const clipMs = asset.durationMs ?? scene.durationMs;
      segments.push({ assetId, startMs: span.startMs, endMs: span.startMs + Math.min(scene.durationMs, clipMs) });
    }
  }
  return segments;
}

/** Asset ids heard at story time `t`. */
export function audibleAt(segments: readonly SoundSegment[], t: number): Set<string> {
  return new Set(segments.filter((s) => t >= s.startMs && t < s.endMs).map((s) => s.assetId));
}

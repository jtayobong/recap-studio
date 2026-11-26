import type { AssetKind } from '../domain/asset';
import type { SoundSegment } from '../domain/music';
import type { Scene } from '../domain/project';
import { DUCK_LEVEL } from '../domain/music';
import { resolveFields } from './fields';
import { getSceneSpans } from './timeline';
import { getTemplate } from './templates/registry';
import { CLIP_SOUND_FIELD, CLIP_VOLUME_FIELD, MUSIC_UNDER_CLIP_FIELD } from './templates/soundFields';

export { CLIP_SOUND_FIELD } from './templates/soundFields';

/** A stored percentage as 0–1, or the fallback for a template without the field. */
const share = (value: unknown, fallback: number) => (typeof value === 'number' ? value / 100 : fallback);

export type AssetLookup = (assetId: string) => { kind: AssetKind; durationMs?: number } | undefined;

/**
 * When video clips are heard with their own sound, in story time. A scene with "Keep clip sound"
 * on plays each of its video clips from the clip's start, for the length of the scene (shorter if
 * the clip ends first): templates draw clips at clip time = scene-local time, so picture and sound
 * line up. Photos and unknown assets make no sound. Each segment carries the scene's "Music under
 * the clip" and "Clip volume" (M10; defaults reproduce the earlier fixed levels). Used by both the
 * preview and the export, so they duck the music and play clip sound at the same moments and levels.
 */
export function soundSegments(scenes: readonly Scene[], lookup: AssetLookup): SoundSegment[] {
  const segments: SoundSegment[] = [];
  for (const span of getSceneSpans(scenes)) {
    const { scene } = span;
    if (scene.fields[CLIP_SOUND_FIELD] !== true) continue;
    const template = getTemplate(scene.templateId);
    if (!template) continue;
    const values = resolveFields(template.fields, scene.fields) as Record<string, unknown>;
    const duckLevel = share(values[MUSIC_UNDER_CLIP_FIELD], DUCK_LEVEL);
    const volume = share(values[CLIP_VOLUME_FIELD], 1);
    const seen = new Set<string>();
    for (const [key, def] of Object.entries(template.fields)) {
      const assetId = scene.fields[key];
      if (def.kind !== 'media' || typeof assetId !== 'string' || !assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      const asset = lookup(assetId);
      if (asset?.kind !== 'video') continue;
      const clipMs = asset.durationMs ?? scene.durationMs;
      segments.push({ assetId, startMs: span.startMs, endMs: span.startMs + Math.min(scene.durationMs, clipMs), duckLevel, volume });
    }
  }
  return segments;
}

/** Clips heard at story time `t`: asset id → volume (0–1; the loudest if a clip is heard twice). */
export function audibleAt(segments: readonly SoundSegment[], t: number): Map<string, number> {
  const heard = new Map<string, number>();
  for (const s of segments) {
    if (t >= s.startMs && t < s.endMs) heard.set(s.assetId, Math.max(heard.get(s.assetId) ?? 0, s.volume));
  }
  return heard;
}

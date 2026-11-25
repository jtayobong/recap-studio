import { z } from 'zod';
import type { Project } from './project';

/**
 * Imported media. The asset row (metadata) lives in IndexedDB; the binary lives in OPFS at
 * `assets/<id>` with an optional thumbnail at `thumbs/<id>.webp`. Projects reference assets by id
 * only (invariant 1). Each asset belongs to exactly one project: duplicating a project copies its
 * files, so deleting a project can delete all of its assets (see DECISIONS.md D15).
 */

const MB = 1024 * 1024;

export const AssetKindSchema = z.enum(['image', 'video', 'audio']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/** Accepted formats and the kind each one maps to. Audio formats arrive with M6. */
export const SUPPORTED_MIME_TYPES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
} as const satisfies Record<string, AssetKind>;

export type SupportedMimeType = keyof typeof SUPPORTED_MIME_TYPES;

const MIME_TYPES = Object.keys(SUPPORTED_MIME_TYPES) as [SupportedMimeType, ...SupportedMimeType[]];

export function isSupportedMimeType(mime: string): mime is SupportedMimeType {
  return Object.hasOwn(SUPPORTED_MIME_TYPES, mime);
}

/** Import limits (source file, before any downscaling). Chosen for M4; see DECISIONS.md D16. */
export const MEDIA_LIMITS = {
  image: { maxBytes: 80 * MB },
  video: { maxBytes: 2048 * MB, maxDurationMs: 5 * 60_000 },
} as const;

/** Images larger than this on their long edge are downscaled on import (2× the 1080 px output). */
export const IMAGE_MAX_EDGE = 2160;

export const FILENAME_MAX = 255;

/**
 * Asset ids become OPFS file names, and stored rows are untrusted, so ids are restricted to
 * characters that are safe as a single path segment.
 */
export const AssetIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/, 'Invalid asset id');

const Dimension = z.number().int().min(1).max(65_535);

export const AssetSchema = z
  .object({
    id: AssetIdSchema,
    projectId: z.string().min(1),
    kind: AssetKindSchema,
    mime: z.enum(MIME_TYPES),
    /** Original file name, for display only. Never used as a path. */
    filename: z.string().min(1).max(FILENAME_MAX),
    /** Size of the stored binary (after downscaling, for images). */
    bytes: z.number().int().min(0),
    width: Dimension.optional(),
    height: Dimension.optional(),
    durationMs: z.number().int().min(0).optional(),
    createdAt: z.number().int(),
  })
  .refine((asset) => SUPPORTED_MIME_TYPES[asset.mime] === asset.kind, {
    message: 'Asset kind does not match its MIME type',
    path: ['kind'],
  });

export type Asset = z.infer<typeof AssetSchema>;

/** Make a user-supplied file name safe to store and display. */
export function normalizeFilename(name: string): string {
  // Drop any path part and control characters; keep the rest for display.
  // eslint-disable-next-line no-control-regex
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base.slice(0, FILENAME_MAX) || 'untitled';
}

/**
 * Rewrite asset references after the project's assets were copied under new ids.
 * Scene fields are template-specific, so any string field value equal to a copied asset id is
 * replaced. Asset ids are random UUIDs, so an accidental match with user text is not a concern.
 * Returns a new project; scenes without references keep their identity.
 */
export function remapAssetIds(project: Project, idMap: ReadonlyMap<string, string>): Project {
  if (idMap.size === 0) return project;

  const scenes = project.scenes.map((scene) => {
    let changed = false;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scene.fields)) {
      const mapped = typeof value === 'string' ? idMap.get(value) : undefined;
      if (mapped !== undefined) changed = true;
      fields[key] = mapped ?? value;
    }
    return changed ? { ...scene, fields } : scene;
  });

  const next = { ...project, scenes };
  const audioId = project.audio ? idMap.get(project.audio.assetId) : undefined;
  if (project.audio && audioId !== undefined) next.audio = { ...project.audio, assetId: audioId };
  return next;
}

/** How many scenes (and the audio track) reference each of the given assets. */
export function countAssetReferences(project: Project, assetIds: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of assetIds) counts.set(id, 0);
  const bump = (id: string) => {
    const count = counts.get(id);
    if (count !== undefined) counts.set(id, count + 1);
  };
  for (const scene of project.scenes) {
    const seen = new Set<string>();
    for (const value of Object.values(scene.fields)) {
      if (typeof value === 'string' && !seen.has(value)) {
        seen.add(value);
        bump(value);
      }
    }
  }
  if (project.audio) bump(project.audio.assetId);
  return counts;
}

/**
 * Remove references to a deleted asset: matching scene fields become '' (an empty media slot)
 * and a matching audio track is removed. Returns the same project if nothing referenced it.
 */
export function clearAssetReferences(project: Project, assetId: string): Project {
  let changed = false;
  const scenes = project.scenes.map((scene) => {
    if (!Object.values(scene.fields).includes(assetId)) return scene;
    changed = true;
    const fields = Object.fromEntries(Object.entries(scene.fields).map(([k, v]) => [k, v === assetId ? '' : v]));
    return { ...scene, fields };
  });
  const dropAudio = project.audio?.assetId === assetId;
  if (!changed && !dropAudio) return project;
  const next: Project = { ...project, scenes };
  if (dropAudio) delete next.audio;
  return next;
}

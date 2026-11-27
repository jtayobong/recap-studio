import { z } from 'zod';
import { newId } from '../lib/ids';
import { DEFAULT_FONT_PAIR_ID, DEFAULT_PALETTE_ID } from './stylePresets';

/**
 * The project document. This is the single source of truth that the editor edits,
 * the renderer (M2) draws, and the exporter (M5) encodes.
 *
 * Bump CURRENT_SCHEMA_VERSION and add a migration in ./migrations.ts whenever the
 * stored shape changes.
 */
export const CURRENT_SCHEMA_VERSION = 7;

export const PROJECT_NAME_MAX = 100;
export const MAX_SCENES = 200;
export const SCENE_MIN_MS = 250;
export const SCENE_MAX_MS = 60_000;

export const FormatSchema = z.object({
  width: z.number().int().min(16).max(3840),
  height: z.number().int().min(16).max(3840),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]),
});

/** Moving shapes behind every scene (M11, schema v4). Older projects migrate to `off`. */
export const BackgroundMotionSchema = z.enum(['off', 'subtle', 'lively']);
export const DEFAULT_BACKGROUND_MOTION: BackgroundMotion = 'subtle';

/**
 * Which shapes the background motion draws (M12.3, schema v5): the original geometric ones, or
 * Filipino fiesta ones (banderitas, parol stars, suns). Older projects migrate to `geometric`.
 */
export const BackgroundShapesSchema = z.enum(['geometric', 'fiesta']);
export const DEFAULT_BACKGROUND_SHAPES: BackgroundShapes = 'geometric';

export const StyleSchema = z.object({
  paletteId: z.string().min(1),
  fontPairId: z.string().min(1),
  backgroundMotion: BackgroundMotionSchema,
  backgroundShapes: BackgroundShapesSchema,
});

/** Scene entrance transitions. v3 (M7) added zoom, wipe, push (left) and flash. */
export const TransitionSchema = z.enum(['cut', 'fade', 'slide', 'push', 'zoom', 'wipe', 'flash']);

export const SceneSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  durationMs: z.number().int().min(SCENE_MIN_MS).max(SCENE_MAX_MS),
  /** Template-specific values, validated against the template's own schema (M2/M3). */
  fields: z.record(z.string(), z.unknown()),
  transitionIn: TransitionSchema,
});

/** Fade lengths for the music track (M6 decisions: fade in ~1 s, fade out ~1.5 s). */
export const MUSIC_FADE_IN_MS = 1000;
export const MUSIC_FADE_OUT_MS = 1500;

/**
 * The story's music (one track). It starts with the story, or with the scene `startSceneId` when
 * set (M12.4, schema v6; a missing scene means the story start); `offsetMs` is where in the song
 * playback starts ("start at 0:45"). It plays once: if the song ends before the story, the rest is
 * silent. Fades apply where the music starts and at whichever ends first, song or story.
 * Schema v2 added `fadeIn`/`fadeOut`.
 */
export const AudioTrackSchema = z.object({
  assetId: z.string().min(1),
  offsetMs: z.number().int().min(0),
  volume: z.number().min(0).max(1),
  fadeIn: z.boolean(),
  fadeOut: z.boolean(),
  /** The scene the music starts with; absent = the first scene (the story start). */
  startSceneId: z.string().min(1).optional(),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX),
  format: FormatSchema,
  style: StyleSchema,
  scenes: z.array(SceneSchema).max(MAX_SCENES),
  audio: AudioTrackSchema.optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type Format = z.infer<typeof FormatSchema>;
export type Style = z.infer<typeof StyleSchema>;
export type BackgroundMotion = z.infer<typeof BackgroundMotionSchema>;
export type BackgroundShapes = z.infer<typeof BackgroundShapesSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

/** A new music track for `assetId`: from the start of the song, full volume, fade out only. */
export function defaultAudioTrack(assetId: string): AudioTrack {
  return { assetId, offsetMs: 0, volume: 1, fadeIn: false, fadeOut: true };
}
export type Project = z.infer<typeof ProjectSchema>;

export const FORMAT_PRESETS = {
  story: { label: 'Story', ratio: '9:16', width: 1080, height: 1920, fps: 30, enabled: true },
  square: { label: 'Square', ratio: '1:1', width: 1080, height: 1080, fps: 30, enabled: false },
  landscape: { label: 'Landscape', ratio: '16:9', width: 1920, height: 1080, fps: 30, enabled: true },
} as const;

export type FormatPresetId = keyof typeof FORMAT_PRESETS;

/** The preset a format matches (same size), if any. */
export function formatPresetOf(format: Pick<Format, 'width' | 'height'>): FormatPresetId | undefined {
  return (Object.keys(FORMAT_PRESETS) as FormatPresetId[]).find(
    (id) => FORMAT_PRESETS[id].width === format.width && FORMAT_PRESETS[id].height === format.height,
  );
}

/**
 * The project in another (enabled) format preset. Scenes, focus points and style are kept;
 * templates lay themselves out for the new shape. Returns the same project when nothing changes.
 */
export function withFormatPreset(project: Project, presetId: FormatPresetId): Project {
  const preset = FORMAT_PRESETS[presetId];
  if (!preset.enabled || formatPresetOf(project.format) === presetId) return project;
  return { ...project, format: { ...project.format, width: preset.width, height: preset.height } };
}

export const DEFAULT_PROJECT_NAME = 'Untitled recap';

/** Trim, collapse whitespace and cap length; empty names become the default. */
export function normalizeProjectName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, PROJECT_NAME_MAX).trim();
  return cleaned || DEFAULT_PROJECT_NAME;
}

export interface NewProjectInput {
  name: string;
  formatPresetId?: FormatPresetId;
  paletteId?: string;
  fontPairId?: string;
  backgroundMotion?: BackgroundMotion;
  backgroundShapes?: BackgroundShapes;
}

export function createProject(
  input: NewProjectInput,
  options: { now?: number; id?: string } = {},
): Project {
  const preset = FORMAT_PRESETS[input.formatPresetId ?? 'story'];
  if (!preset.enabled) {
    throw new Error(`The ${preset.label} format isn't available yet.`);
  }
  const now = options.now ?? Date.now();

  return ProjectSchema.parse({
    id: options.id ?? newId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: normalizeProjectName(input.name),
    format: { width: preset.width, height: preset.height, fps: preset.fps },
    style: {
      paletteId: input.paletteId ?? DEFAULT_PALETTE_ID,
      fontPairId: input.fontPairId ?? DEFAULT_FONT_PAIR_ID,
      backgroundMotion: input.backgroundMotion ?? DEFAULT_BACKGROUND_MOTION,
      backgroundShapes: input.backgroundShapes ?? DEFAULT_BACKGROUND_SHAPES,
    },
    scenes: [],
    createdAt: now,
    updatedAt: now,
  });
}

/** Total story length in milliseconds (transitions overlap is handled by the renderer later). */
export function projectDurationMs(project: Pick<Project, 'scenes'>): number {
  return project.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
}

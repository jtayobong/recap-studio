import { describe, expect, it } from 'vitest';
import {
  createProject,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PROJECT_NAME,
  normalizeProjectName,
  PROJECT_NAME_MAX,
  projectDurationMs,
  ProjectSchema,
} from './project';

describe('createProject', () => {
  it('creates a valid 9:16 project with defaults', () => {
    const project = createProject({ name: '  My   2026 Recap ' }, { now: 1000, id: 'p1' });

    expect(project).toEqual({
      id: 'p1',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name: 'My 2026 Recap',
      format: { width: 1080, height: 1920, fps: 30 },
      style: { paletteId: 'neon-pulse', fontPairId: 'heavy-grotesk' },
      scenes: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('generates unique ids', () => {
    expect(createProject({ name: 'a' }).id).not.toBe(createProject({ name: 'b' }).id);
  });

  it('rejects formats that are not available yet', () => {
    expect(() => createProject({ name: 'x', formatPresetId: 'square' })).toThrow(/isn't available/);
  });
});

describe('normalizeProjectName', () => {
  it('falls back to the default name when blank', () => {
    expect(normalizeProjectName('   ')).toBe(DEFAULT_PROJECT_NAME);
  });

  it('caps the length', () => {
    expect(normalizeProjectName('x'.repeat(500))).toHaveLength(PROJECT_NAME_MAX);
  });
});

describe('ProjectSchema', () => {
  const valid = createProject({ name: 'ok' }, { now: 1, id: 'p' });

  it('rejects scenes with an out-of-range duration', () => {
    const bad = {
      ...valid,
      scenes: [{ id: 's', templateId: 'title', durationMs: 10, fields: {}, transitionIn: 'cut' }],
    };
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown transitions', () => {
    const bad = {
      ...valid,
      scenes: [{ id: 's', templateId: 'title', durationMs: 3000, fields: {}, transitionIn: 'spin' }],
    };
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(ProjectSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });
});

describe('projectDurationMs', () => {
  it('sums scene durations', () => {
    const scene = { id: 's', templateId: 't', fields: {}, transitionIn: 'cut' as const };
    expect(
      projectDurationMs({
        scenes: [
          { ...scene, durationMs: 3000 },
          { ...scene, id: 's2', durationMs: 2500 },
        ],
      }),
    ).toBe(5500);
  });
});

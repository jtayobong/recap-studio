import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrateProject, migrateRaw, ProjectDataError, type Migration } from './migrations';
import { createProject, CURRENT_SCHEMA_VERSION } from './project';

describe('migrateRaw', () => {
  it('runs each step in order up to the target version', () => {
    const migrations: Record<number, Migration> = {
      1: (p) => ({ ...p, schemaVersion: 2, steps: ['1→2'] }),
      2: (p) => ({ ...p, schemaVersion: 3, steps: [...(p.steps as string[]), '2→3'] }),
    };
    const result = migrateRaw({ id: 'x', schemaVersion: 1 }, migrations, 3);
    expect(result).toEqual({ id: 'x', schemaVersion: 3, steps: ['1→2', '2→3'] });
  });

  it('does not mutate the input', () => {
    const input = { schemaVersion: 1, nested: { a: 1 } };
    migrateRaw(input, { 1: (p) => ({ ...p, schemaVersion: 2, nested: { a: 2 } }) }, 2);
    expect(input).toEqual({ schemaVersion: 1, nested: { a: 1 } });
  });

  it('throws when a migration step is missing', () => {
    expect(() => migrateRaw({ schemaVersion: 1 }, {}, 2)).toThrow(/No migration from schema v1/);
  });

  it('throws when a migration forgets to bump the version', () => {
    expect(() => migrateRaw({ schemaVersion: 1 }, { 1: (p) => ({ ...p }) }, 2)).toThrow(/did not produce/);
  });

  it('refuses data from a newer app version', () => {
    expect(() => migrateRaw({ schemaVersion: 99 }, {}, 1)).toThrow(/newer version/);
  });

  it.each([null, 'text', 42, [], {}, { schemaVersion: '1' }, { schemaVersion: 0 }])(
    'rejects malformed input %j',
    (input) => {
      expect(() => migrateRaw(input, {}, 1)).toThrow(ProjectDataError);
    },
  );
});

describe('migrateProject', () => {
  it('returns a current, valid project unchanged', () => {
    const project = createProject({ name: 'Fine' }, { now: 5, id: 'p' });
    expect(migrateProject(structuredClone(project))).toEqual(project);
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('reports which fields are invalid', () => {
    const project = createProject({ name: 'Broken' }, { now: 5, id: 'p' });
    const corrupt = { ...project, format: { ...project.format, fps: 7 } };
    expect(() => migrateProject(corrupt)).toThrow(/format\.fps/);
  });
});

describe('real migrations', () => {
  it('v1 → current: a music track gets fade toggles (fade out on, fade in off); nothing else changes', async () => {
    const v1 = (await import('./fixtures/project-v1.json')).default as Record<string, unknown>;
    const migrated = migrateProject(structuredClone(v1));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.audio).toEqual({
      assetId: '2da05e70-8c65-4e2a-9f2d-4b9b9f3b2c33',
      offsetMs: 45000,
      volume: 0.8,
      fadeIn: false,
      fadeOut: true,
    });
    const without = (p: Record<string, unknown>) => {
      const copy = { ...p };
      delete copy.schemaVersion;
      delete copy.audio;
      delete copy.style; // v4 adds background motion (checked below)
      return copy;
    };
    expect(without(migrated)).toEqual(without(v1));
  });

  it('v1 → current: a project without music stays without music', async () => {
    const v1 = (await import('./fixtures/project-v1.json')).default as Record<string, unknown>;
    const noMusic = structuredClone(v1);
    delete noMusic.audio;
    const migrated = migrateProject(noMusic);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect('audio' in migrated).toBe(false);
  });

  it('v1 → v2: keeps explicit fade values if a v1 file somehow has them', () => {
    const migrate = MIGRATIONS[1]!;
    expect(migrate({ schemaVersion: 1, audio: { assetId: 'a', offsetMs: 0, volume: 1, fadeOut: false } }).audio).toMatchObject({
      fadeIn: false,
      fadeOut: false,
    });
  });

  it('v2 → v3: only the version changes (new transition kinds need no data changes)', async () => {
    const v2 = (await import('./fixtures/project-v2.json')).default as Record<string, unknown>;
    const migrated = MIGRATIONS[2]!(structuredClone(v2));
    expect(migrated.schemaVersion).toBe(3);
    expect({ ...migrated, schemaVersion: 2 }).toEqual(v2);
  });

  it('v3 → v4: existing projects get background motion off; nothing else changes', async () => {
    const v3 = (await import('./fixtures/project-v3.json')).default as Record<string, unknown>;
    const migrated = migrateProject(structuredClone(v3));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.style).toEqual({ paletteId: 'citrus-pop', fontPairId: 'heavy-grotesk', backgroundMotion: 'off', backgroundShapes: 'geometric' });
    expect({ ...migrated, schemaVersion: 3, style: v3.style }).toEqual(v3);
  });

  it('v1 → current also ends with background motion off', async () => {
    const v1 = (await import('./fixtures/project-v1.json')).default as Record<string, unknown>;
    expect(migrateProject(structuredClone(v1)).style.backgroundMotion).toBe('off');
  });

  it('new projects start with subtle background motion', () => {
    expect(createProject({ name: 'New' }).style.backgroundMotion).toBe('subtle');
    expect(createProject({ name: 'New', backgroundMotion: 'lively' }).style.backgroundMotion).toBe('lively');
  });

  it('v4 → v5: existing projects keep the geometric shapes (and their motion level); nothing else changes', async () => {
    const v4 = (await import('./fixtures/project-v4.json')).default as Record<string, unknown>;
    const migrated = migrateProject(structuredClone(v4));
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.style).toEqual({ paletteId: 'citrus-pop', fontPairId: 'heavy-grotesk', backgroundMotion: 'lively', backgroundShapes: 'geometric' });
    expect({ ...migrated, schemaVersion: 4, style: v4.style }).toEqual(v4);
  });

  it('new projects start with geometric shapes; fiesta can be chosen', () => {
    expect(createProject({ name: 'New' }).style.backgroundShapes).toBe('geometric');
    expect(createProject({ name: 'New', backgroundShapes: 'fiesta' }).style.backgroundShapes).toBe('fiesta');
  });

  it('v3 accepts the new transition kinds', () => {
    const project = createProject({ name: 'T' }, { now: 1, id: 'p' });
    const scene = { id: 's', templateId: 'title', durationMs: 3000, fields: {}, transitionIn: 'wipe' };
    expect(migrateProject({ ...project, scenes: [scene] }).scenes[0]?.transitionIn).toBe('wipe');
  });
});


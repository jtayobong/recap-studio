import { describe, expect, it } from 'vitest';
import { migrateProject, migrateRaw, ProjectDataError, type Migration } from './migrations';
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

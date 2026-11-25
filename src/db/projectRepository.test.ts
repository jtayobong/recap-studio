import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectDataError } from '../domain/migrations';
import { DEFAULT_PROJECT_NAME, PROJECT_NAME_MAX, type Project } from '../domain/project';
import { EditorDatabase } from './database';
import { copyName, createProjectRepository, ProjectNotFoundError, type ProjectRepository } from './projectRepository';

// fake-indexeddb is installed globally by the Vitest setup file.

let database: EditorDatabase;
let repo: ProjectRepository;
let clock: number;

beforeEach(() => {
  database = new EditorDatabase(`test-${crypto.randomUUID()}`);
  clock = 1_000;
  repo = createProjectRepository(database, { now: () => clock });
});

afterEach(async () => {
  await database.delete();
});

const tick = (ms = 1_000) => {
  clock += ms;
};

describe('projectRepository', () => {
  it('creates and reads back a project', async () => {
    const created = await repo.create({ name: 'Year in Review' });
    const loaded = await repo.get(created.id);
    expect(loaded).toEqual(created);
    expect(loaded?.createdAt).toBe(1_000);
  });

  it('returns undefined for unknown ids', async () => {
    expect(await repo.get('missing')).toBeUndefined();
  });

  it('lists projects newest-first', async () => {
    const a = await repo.create({ name: 'A' });
    tick();
    const b = await repo.create({ name: 'B' });
    tick();
    await repo.save({ ...a, name: 'A edited' });

    const { projects, broken } = await repo.list();
    expect(projects.map((p) => p.name)).toEqual(['A edited', 'B']);
    expect(projects[1]?.id).toBe(b.id);
    expect(broken).toEqual([]);
  });

  it('reports unreadable rows instead of failing the whole list', async () => {
    await repo.create({ name: 'Good' });
    await database.projects.put({ id: 'bad', updatedAt: 5, schemaVersion: 1, name: '' });
    await database.projects.put({ id: 'future', updatedAt: 6, schemaVersion: 42 });

    const { projects, broken } = await repo.list();
    expect(projects.map((p) => p.name)).toEqual(['Good']);
    expect(broken.map((b) => b.id).sort()).toEqual(['bad', 'future']);
    expect(broken.find((b) => b.id === 'future')?.reason).toMatch(/newer version/);
  });

  it('stamps updatedAt on save', async () => {
    const project = await repo.create({ name: 'Stamp' });
    tick(5_000);
    const saved = await repo.save({ ...project, style: { ...project.style, paletteId: 'mint-riot' } });
    expect(saved.updatedAt).toBe(6_000);
    expect((await repo.get(project.id))?.style.paletteId).toBe('mint-riot');
  });

  it('refuses to save invalid data', async () => {
    const project = await repo.create({ name: 'Valid' });
    const invalid = { ...project, scenes: [{ bogus: true }] } as unknown as Project;
    await expect(repo.save(invalid)).rejects.toBeInstanceOf(ProjectDataError);
    expect((await repo.get(project.id))?.scenes).toEqual([]);
  });

  it('renames with normalization', async () => {
    const project = await repo.create({ name: 'Old' });
    expect((await repo.rename(project.id, '  New   name ')).name).toBe('New name');
    expect((await repo.rename(project.id, '   ')).name).toBe(DEFAULT_PROJECT_NAME);
  });

  it('throws when renaming a missing project', async () => {
    await expect(repo.rename('nope', 'x')).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('duplicates with new project and scene ids', async () => {
    const original = await repo.create({ name: 'Original' });
    const withScene = await repo.save({
      ...original,
      scenes: [{ id: 'scene-1', templateId: 'title', durationMs: 3000, fields: { text: 'Hi' }, transitionIn: 'fade' }],
    });
    tick();

    const copy = await repo.duplicate(original.id);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Original (copy)');
    expect(copy.scenes).toHaveLength(1);
    expect(copy.scenes[0]?.id).not.toBe('scene-1');
    expect(copy.scenes[0]?.fields).toEqual({ text: 'Hi' });
    expect(copy.createdAt).toBe(clock);
    // The original is untouched.
    expect(await repo.get(original.id)).toEqual(withScene);
  });

  it('deletes', async () => {
    const project = await repo.create({ name: 'Gone' });
    await repo.remove(project.id);
    expect(await repo.get(project.id)).toBeUndefined();
  });
});

describe('copyName', () => {
  it('keeps names within the length limit', () => {
    const name = copyName('x'.repeat(PROJECT_NAME_MAX));
    expect(name.length).toBeLessThanOrEqual(PROJECT_NAME_MAX);
    expect(name.endsWith(' (copy)')).toBe(true);
  });
});

import { migrateProject, ProjectDataError } from '../domain/migrations';
import {
  createProject,
  normalizeProjectName,
  PROJECT_NAME_MAX,
  ProjectSchema,
  type NewProjectInput,
  type Project,
} from '../domain/project';
import { describeError } from '../lib/errors';
import { newId } from '../lib/ids';
import type { EditorDatabase } from './database';

export interface ProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  paletteId: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface BrokenProject {
  id: string;
  reason: string;
}

export interface ProjectList {
  projects: ProjectSummary[];
  /** Rows that exist but can't be opened (corrupt, or from a newer app version). */
  broken: BrokenProject[];
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project ${id} was not found.`);
    this.name = 'ProjectNotFoundError';
  }
}

function toSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    width: project.format.width,
    height: project.format.height,
    paletteId: project.style.paletteId,
    sceneCount: project.scenes.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function validate(project: Project): Project {
  const result = ProjectSchema.safeParse(project);
  if (!result.success) {
    throw new ProjectDataError(`Refusing to save invalid project: ${result.error.issues[0]?.message ?? 'unknown issue'}`);
  }
  return result.data;
}

export function copyName(name: string): string {
  const suffix = ' (copy)';
  return `${name.slice(0, PROJECT_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
}

/**
 * All project persistence goes through here. The rest of the app never touches Dexie
 * directly, which keeps storage swappable and makes validation impossible to skip.
 */
export function createProjectRepository(database: EditorDatabase, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;

  async function list(): Promise<ProjectList> {
    const rows = await database.projects.orderBy('updatedAt').reverse().toArray();
    const projects: ProjectSummary[] = [];
    const broken: BrokenProject[] = [];
    for (const row of rows) {
      try {
        projects.push(toSummary(migrateProject(row)));
      } catch (error) {
        broken.push({ id: String(row.id), reason: describeError(error) });
      }
    }
    return { projects, broken };
  }

  async function get(id: string): Promise<Project | undefined> {
    const row = await database.projects.get(id);
    return row === undefined ? undefined : migrateProject(row);
  }

  async function save(project: Project): Promise<Project> {
    const next = validate({ ...project, updatedAt: now() });
    await database.projects.put(next);
    return next;
  }

  async function create(input: NewProjectInput): Promise<Project> {
    const project = createProject(input, { now: now() });
    await database.projects.add(project);
    return project;
  }

  async function rename(id: string, name: string): Promise<Project> {
    return database.transaction('rw', database.projects, async () => {
      const project = await get(id);
      if (!project) throw new ProjectNotFoundError(id);
      return save({ ...project, name: normalizeProjectName(name) });
    });
  }

  async function duplicate(id: string): Promise<Project> {
    return database.transaction('rw', database.projects, async () => {
      const original = await get(id);
      if (!original) throw new ProjectNotFoundError(id);
      const timestamp = now();
      const copy = validate({
        ...structuredClone(original),
        id: newId(),
        name: copyName(original.name),
        scenes: original.scenes.map((scene) => ({ ...structuredClone(scene), id: newId() })),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await database.projects.add(copy);
      return copy;
    });
  }

  /** Deletes the project document. Media cleanup (OPFS) is added with assets in M4. */
  async function remove(id: string): Promise<void> {
    await database.projects.delete(id);
  }

  return { list, get, save, create, rename, duplicate, remove };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;

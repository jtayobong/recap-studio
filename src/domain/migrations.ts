import { CURRENT_SCHEMA_VERSION, ProjectSchema, type Project } from './project';

/**
 * Schema migrations.
 *
 * Stored projects are treated as untrusted, possibly-old data. Every read goes through
 * `migrateProject`, which upgrades the raw object step by step and then validates it.
 *
 * To change the schema:
 *   1. Bump CURRENT_SCHEMA_VERSION in ./project.ts.
 *   2. Add a migration keyed by the version it migrates FROM, e.g.
 *        1: (p) => ({ ...p, schemaVersion: 2, newField: 'default' }),
 *   3. Add a test with a real v1 fixture in migrations.test.ts.
 */

export type RawProject = Record<string, unknown>;
export type Migration = (raw: RawProject) => RawProject;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class ProjectDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectDataError';
  }
}

function isPlainObject(value: unknown): value is RawProject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Upgrade a raw stored object to `targetVersion` without validating its full shape. */
export function migrateRaw(
  input: unknown,
  migrations: Readonly<Record<number, Migration>>,
  targetVersion: number,
): RawProject {
  if (!isPlainObject(input)) {
    throw new ProjectDataError('Project data is not an object.');
  }

  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectDataError('Project data has no valid schema version.');
  }
  if (version > targetVersion) {
    throw new ProjectDataError(
      `This project was saved by a newer version of the app (schema v${version}). Update the app to open it.`,
    );
  }

  let current: RawProject = input;
  for (let v = version; v < targetVersion; v += 1) {
    const migrate = migrations[v];
    if (!migrate) {
      throw new ProjectDataError(`No migration from schema v${v} to v${v + 1}.`);
    }
    current = migrate(structuredClone(current));
    if (current.schemaVersion !== v + 1) {
      throw new ProjectDataError(`Migration from v${v} did not produce schema v${v + 1}.`);
    }
  }
  return current;
}

/** Migrate and validate. Throws ProjectDataError with a readable message on failure. */
export function migrateProject(
  input: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Project {
  const upgraded = migrateRaw(input, migrations, CURRENT_SCHEMA_VERSION);
  const result = ProjectSchema.safeParse(upgraded);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ProjectDataError(`Project data is invalid — ${summary}`);
  }
  return result.data;
}

import { EditorDatabase } from './database';
import { createProjectRepository } from './projectRepository';

/** App-wide singletons. Tests create their own instances instead of importing these. */
export const database = new EditorDatabase();
export const projectRepository = createProjectRepository(database);

import { projectRepository } from '../db';
import { createEditorStore } from './createEditorStore';

export const useEditorStore = createEditorStore(projectRepository);

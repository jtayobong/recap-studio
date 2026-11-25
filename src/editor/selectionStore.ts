import { create } from 'zustand';

/** Which scene the inspector is editing. UI-only state: never saved, never in undo history. */
export interface SelectionState {
  selectedSceneId: string | null;
}

export const useSelectionStore = create<SelectionState>()(() => ({ selectedSceneId: null }));

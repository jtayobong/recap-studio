import { useEffect } from 'react';
import { isDialogOpen, isPrimaryModifier, isTypingTarget } from '../lib/keyboard';
import { useEditorStore } from '../store/editorStore';
import { selectScene } from './sceneActions';

/**
 * Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y redo · Escape deselects the scene.
 * Inside text fields the browser's own text undo applies instead.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isDialogOpen() || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const { undo, redo } = useEditorStore.getState();

      if (isPrimaryModifier(event) && key === 'z') {
        if (event.shiftKey) redo();
        else undo();
      } else if (event.ctrlKey && !event.metaKey && key === 'y') {
        redo();
      } else if (key === 'escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        selectScene(null, { show: false });
      } else {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

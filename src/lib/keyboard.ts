/** True when keystrokes should go to a form field rather than to editor shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    // Checkboxes, radios, buttons and the scrubber (range) don't consume text keys.
    return !['checkbox', 'radio', 'range', 'button'].includes(target.type);
  }
  return false;
}

/** Shortcuts are suspended while a modal dialog is open. */
export function isDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

/** Cmd on macOS, Ctrl elsewhere. */
export function isPrimaryModifier(event: KeyboardEvent): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
}

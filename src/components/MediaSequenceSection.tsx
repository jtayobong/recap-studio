import type { Scene } from '../domain/project';
import { filledSlots, perItemText } from '../editor/mediaSequence';
import type { SceneTemplate } from '../render/templates/types';

/**
 * Inspector summary for templates that show media one after another (the photo carousel): how long
 * each item is on screen.
 */
export function MediaSequenceSection({ scene, template }: { scene: Scene; template: SceneTemplate }) {
  const sequence = template.mediaSequence;
  if (!sequence) return null;
  const count = filledSlots(sequence, scene.fields).length;
  return (
    <div className="media-sequence">
      <p className="field__hint" aria-live="polite">
        {perItemText(count, scene.durationMs)}
      </p>
    </div>
  );
}

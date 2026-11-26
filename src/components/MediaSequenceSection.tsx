import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { assetRepository } from '../db';
import type { Asset } from '../domain/asset';
import type { Scene } from '../domain/project';
import { filledSlots, freeSlots, perItemText } from '../editor/mediaSequence';
import { addSceneMedia } from '../editor/sceneActions';
import type { SceneTemplate } from '../render/templates/types';
import { AssetThumbnail, describeAsset } from './AssetTile';
import { Modal } from './Modal';

interface MediaSequenceSectionProps {
  scene: Scene;
  template: SceneTemplate;
  projectId: string;
}

/**
 * Inspector block for templates that show media one after another (the photo carousel): how long
 * each item is on screen, and "Add photos…" to fill several empty slots at once.
 */
export function MediaSequenceSection({ scene, template, projectId }: MediaSequenceSectionProps) {
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const sequence = template.mediaSequence;
  if (!sequence) return null;
  const count = filledSlots(sequence, scene.fields).length;
  const free = freeSlots(sequence, scene.fields);
  const firstSlot = template.fields[sequence[0] ?? ''];
  const accept = firstSlot?.kind === 'media' ? firstSlot.accept : [];

  return (
    <div className="media-sequence">
      <div className="media-sequence__row">
        <p className="field__hint media-sequence__summary" aria-live="polite">
          {perItemText(count, scene.durationMs)}
        </p>
        <button
          type="button"
          className="button button--small"
          onClick={() => {
            setNote(null);
            setPicking(true);
          }}
          disabled={free === 0}
          title={free === 0 ? `All ${sequence.length} slots are filled` : undefined}
        >
          Add photos…
        </button>
      </div>
      {note && <p className="field__hint">{note}</p>}
      <Modal open={picking} title="Add photos and clips" onClose={() => setPicking(false)}>
        <MultiMediaPicker
          projectId={projectId}
          accept={accept}
          free={free}
          onAdd={(ids) => {
            const leftOver = addSceneMedia(scene.id, ids);
            setNote(leftOver > 0 ? `${leftOver} didn’t fit: the carousel holds ${sequence.length}.` : null);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      </Modal>
    </div>
  );
}

interface MultiMediaPickerProps {
  projectId: string;
  accept: readonly Asset['kind'][];
  /** Empty slots left; picking more is allowed but only this many are added. */
  free: number;
  onAdd: (assetIds: string[]) => void;
  onCancel: () => void;
}

/**
 * Library picker with one toggle per photo or clip. Items are added in the order they were picked
 * (the number on each tile). Mounted only while the dialog is open, so it starts empty each time.
 */
function MultiMediaPicker({ projectId, accept, free, onAdd, onCancel }: MultiMediaPickerProps) {
  const assets = useLiveQuery(() => assetRepository.listForProject(projectId), [projectId]);
  const eligible = (assets ?? []).filter((a) => accept.includes(a.kind));
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));
  const adding = Math.min(picked.length, free);

  return (
    <>
      {assets !== undefined && eligible.length === 0 ? (
        <p className="modal__body">No photos or clips in this project yet. Import some in the Media panel.</p>
      ) : (
        <>
          <p className="modal__body">
            Pick in the order they should appear. {free} {free === 1 ? 'slot is' : 'slots are'} free.
          </p>
          <ul className="media-picker" aria-label="Media">
            {eligible.map((asset) => {
              const order = picked.indexOf(asset.id);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="media-picker__item"
                    aria-pressed={order !== -1}
                    onClick={() => toggle(asset.id)}
                    title={describeAsset(asset)}
                  >
                    <span className="media-picker__thumb">
                      <AssetThumbnail asset={asset} />
                      {order !== -1 && (
                        <span className="media-picker__order" aria-hidden="true">
                          {order + 1}
                        </span>
                      )}
                    </span>
                    <span className="media-picker__name">{asset.filename}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {picked.length > free && (
        <p className="field__hint" role="status">
          Only the first {free} will be added.
        </p>
      )}
      <div className="modal__actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button button--primary" disabled={adding === 0} onClick={() => onAdd(picked)}>
          {adding === 0 ? 'Add' : `Add ${adding}`}
        </button>
      </div>
    </>
  );
}

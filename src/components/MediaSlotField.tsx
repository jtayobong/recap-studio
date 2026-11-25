import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState, type DragEvent } from 'react';
import { assetRepository } from '../db';
import type { Asset, AssetKind } from '../domain/asset';
import { describeError } from '../lib/errors';
import { importer, useAssetStatus } from '../media';
import { draggedAssetKind, droppedAssetId, hasFiles, isAssetDrag } from '../media/dragData';
import { ImportError } from '../media/importAsset';
import type { MediaField } from '../render/fields';
import { AssetThumbnail, describeAsset } from './AssetTile';
import { FocusPicker, type FocusBinding } from './FocusPicker';
import { Modal } from './Modal';

interface MediaSlotFieldProps {
  def: MediaField;
  /** Asset id, or '' when the slot is empty. */
  value: string;
  projectId: string;
  onChange: (assetId: string) => void;
  /** When the field has a focus point (see MediaField.focus). */
  focus?: FocusBinding;
}

type DropState = 'idle' | 'accept' | 'reject';

function acceptText(accept: readonly AssetKind[]): string {
  const photos = accept.includes('image');
  const clips = accept.includes('video');
  if (photos && clips) return 'photos and clips';
  return photos ? 'photos' : clips ? 'clips' : 'media';
}

/**
 * Inspector control for a `media` field. Three ways to fill it: "Choose…" (library picker; the
 * keyboard path), dragging a library tile onto it, or dropping files from the computer (imported
 * into the library first). Changes go through `onChange`, i.e. `setSceneField`, so they're undoable.
 */
export function MediaSlotField({ def, value, projectId, onChange, focus }: MediaSlotFieldProps) {
  const assets = useLiveQuery(() => assetRepository.listForProject(projectId), [projectId]);
  const asset = value ? assets?.find((a) => a.id === value) : undefined;
  const accepted = (assets ?? []).filter((a) => def.accept.includes(a.kind));

  const [picking, setPicking] = useState(false);
  const [dropState, setDropState] = useState<DropState>('idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const labelId = useId();
  const statusId = useId();

  const accepts = (kind: AssetKind | undefined) => kind !== undefined && def.accept.includes(kind);

  function dropStateFor(event: DragEvent): DropState | null {
    if (isAssetDrag(event.dataTransfer)) return accepts(draggedAssetKind(event.dataTransfer)) ? 'accept' : 'reject';
    if (hasFiles(event.dataTransfer)) return busy ? 'reject' : 'accept';
    return null;
  }

  const onDragOver = (event: DragEvent) => {
    const state = dropStateFor(event);
    if (state === null) return;
    event.preventDefault(); // also stops the window-level file-drop guard
    event.stopPropagation();
    event.dataTransfer.dropEffect = state === 'accept' ? 'copy' : 'none';
    if (state !== dropState) setDropState(state);
  };

  const onDrop = (event: DragEvent) => {
    const state = dropStateFor(event);
    if (state === null) return;
    event.preventDefault();
    event.stopPropagation(); // don't let the media library also import the files
    setDropState('idle');
    if (state === 'reject') return;
    const assetId = droppedAssetId(event.dataTransfer);
    if (assetId) {
      setMessage(null);
      onChange(assetId);
      return;
    }
    void importAndUse([...event.dataTransfer.files]);
  };

  async function importAndUse(files: File[]) {
    if (files.length === 0) return;
    setMessage(null);
    setBusy(files.length === 1 ? `Importing ${files[0]?.name ?? ''}…` : `Importing ${files.length} files…`);
    try {
      const result = await importer.importFiles(files, projectId);
      const usable = result.imported.find((a) => accepts(a.kind));
      if (usable) onChange(usable.id);
      const notes = result.failed.map((f) => f.error.message);
      if (!usable && result.imported.length > 0) {
        notes.push(`Added to the library, but this slot takes ${acceptText(def.accept)}.`);
      }
      setMessage(notes.length > 0 ? notes.join(' ') : null);
    } catch (error) {
      setMessage(error instanceof ImportError ? error.message : describeError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="field" role="group" aria-labelledby={labelId} aria-describedby={statusId}>
      <span id={labelId} className="field__label">
        {def.label}
      </span>
      <div
        className={`media-slot media-slot--${dropState}`}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropState('idle');
        }}
        onDrop={onDrop}
        data-testid="media-slot"
      >
        <SlotPreview value={value} asset={asset} loaded={assets !== undefined} accept={def.accept} />
        <div className="media-slot__actions">
          <button type="button" className="button button--small" onClick={() => setPicking(true)} disabled={busy !== null}>
            {value ? 'Replace…' : 'Choose…'}
          </button>
          {value && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => {
                setMessage(null);
                onChange('');
              }}
              disabled={busy !== null}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <p id={statusId} className={message ? 'field__hint field__hint--error' : 'field__hint'} role={message ? 'alert' : undefined}>
        {busy ?? message ?? `Drag ${acceptText(def.accept)} here from the media library or your computer.`}
      </p>
      {focus && asset && def.accept.includes(asset.kind) && asset.width && asset.height && (
        <FocusPicker asset={asset} focus={focus} />
      )}

      <MediaPicker
        open={picking}
        title={`Choose ${def.label.toLowerCase()}`}
        assets={accepted}
        selectedId={value}
        emptyText={`No ${acceptText(def.accept)} in this project yet. Import some in the Media panel, or drop a file on this slot.`}
        onPick={(id) => {
          setMessage(null);
          onChange(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </div>
  );
}

function SlotPreview({
  value,
  asset,
  loaded,
  accept,
}: {
  value: string;
  asset: Asset | undefined;
  loaded: boolean;
  accept: readonly AssetKind[];
}) {
  if (!value) {
    return (
      <div className="media-slot__preview">
        <div className="media-slot__thumb media-slot__thumb--empty" aria-hidden="true" />
        <span className="media-slot__name">Empty</span>
      </div>
    );
  }
  if (!asset) {
    return (
      <div className="media-slot__preview">
        <div className="media-slot__thumb media-slot__thumb--empty" aria-hidden="true" />
        <span className="media-slot__name">{loaded ? 'Missing media (deleted from the library)' : 'Loading…'}</span>
      </div>
    );
  }
  return <AssetPreview asset={asset} wrongKind={!accept.includes(asset.kind)} acceptLabel={acceptText(accept)} />;
}

function AssetPreview({ asset, wrongKind, acceptLabel }: { asset: Asset; wrongKind: boolean; acceptLabel: string }) {
  const missing = useAssetStatus(asset.id).state === 'missing';
  return (
    <div className="media-slot__preview">
      <div className="media-slot__thumb">
        <AssetThumbnail asset={asset} />
      </div>
      <div className="media-slot__info">
        <span className="media-slot__name" title={asset.filename}>
          {asset.filename}
        </span>
        <span className="media-slot__meta">{describeAsset(asset)}</span>
        {missing && <span className="media-slot__warning">File missing from storage</span>}
        {wrongKind && <span className="media-slot__warning">This slot takes {acceptLabel}</span>}
      </div>
    </div>
  );
}

interface MediaPickerProps {
  open: boolean;
  title: string;
  assets: Asset[];
  selectedId: string;
  emptyText: string;
  onPick: (assetId: string) => void;
  onClose: () => void;
}

/** Library picker dialog: one button per eligible asset. */
function MediaPicker({ open, title, assets, selectedId, emptyText, onPick, onClose }: MediaPickerProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {assets.length === 0 ? (
        <p className="modal__body">{emptyText}</p>
      ) : (
        <ul className="media-picker" aria-label="Media">
          {assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className="media-picker__item"
                aria-pressed={asset.id === selectedId}
                onClick={() => onPick(asset.id)}
                title={describeAsset(asset)}
              >
                <span className="media-picker__thumb">
                  <AssetThumbnail asset={asset} />
                </span>
                <span className="media-picker__name">{asset.filename}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="modal__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

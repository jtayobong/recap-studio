import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { assetRepository } from '../db';
import { projectDurationMs, type Project } from '../domain/project';
import { mediaAssetIds, scenesWithMissingMedia } from '../export/mediaRefs';
import { bitrateFor, DEFAULT_PRESET, QUALITY_PRESETS, type QualityPresetId } from '../export/presets';
import { formatAspectRatio, formatBytes, formatDuration } from '../lib/format';
import { Modal } from './Modal';

interface ExportDialogProps {
  open: boolean;
  project: Project;
  onStart: (preset: QualityPresetId) => void;
  onClose: () => void;
}

const PRESET_ORDER: QualityPresetId[] = ['standard', 'high', 'small'];

/** Export options: quality preset, size estimate, and a warning about missing media. */
export function ExportDialog({ open, project, onStart, onClose }: ExportDialogProps) {
  return (
    <Modal open={open} title="Export video" onClose={onClose}>
      {/* Remount per opening so the choice starts from the default each time. */}
      {open && <ExportOptions project={project} onStart={onStart} onClose={onClose} />}
    </Modal>
  );
}

function ExportOptions({ project, onStart, onClose }: Omit<ExportDialogProps, 'open'>) {
  const [preset, setPreset] = useState<QualityPresetId>(DEFAULT_PRESET);
  const groupId = useId();
  const library = useLiveQuery(() => assetRepository.listForProject(project.id), [project.id]);
  const durationMs = projectDurationMs(project);
  const { width, height, fps } = project.format;

  const libraryIds = new Set((library ?? []).map((asset) => asset.id));
  const missing = new Set([...mediaAssetIds(project)].filter((id) => !libraryIds.has(id)));
  const missingScenes = library ? scenesWithMissingMedia(project, missing) : 0;

  return (
    <form
      className="export-options"
      onSubmit={(event) => {
        event.preventDefault();
        onStart(preset);
      }}
    >
      <p className="export-options__summary">
        {formatAspectRatio(width, height)} · {width}×{height} · {fps} fps · {formatDuration(durationMs)}
      </p>

      <fieldset className="export-options__presets" aria-describedby={`${groupId}-hint`}>
        <legend>Quality</legend>
        {PRESET_ORDER.map((id) => {
          const option = QUALITY_PRESETS[id];
          const estimate = (bitrateFor(id, project.format) * durationMs) / 1000 / 8;
          return (
            <label key={id} className="export-preset">
              <input type="radio" name={`${groupId}-preset`} value={id} checked={preset === id} onChange={() => setPreset(id)} />
              <span className="export-preset__text">
                <span className="export-preset__name">{option.label}</span>
                <span className="export-preset__desc">
                  {option.description} · up to ~{formatBytes(estimate)}
                </span>
              </span>
            </label>
          );
        })}
        <p id={`${groupId}-hint`} className="field__hint">
          MP4 (H.264 video, AAC sound) where your browser supports it, otherwise WebM (VP9, Opus).
          {project.audio ? '' : ' This story has no music.'}
        </p>
      </fieldset>

      {missingScenes > 0 && (
        <p className="export-options__warning" role="note">
          {missingScenes === 1 ? '1 scene uses' : `${missingScenes} scenes use`} media that is no longer in the library.
          {missingScenes === 1 ? ' It' : ' They'} will show an empty placeholder in the video.
        </p>
      )}

      {project.audio && (
        <p className="muted export-options__note">
          Make sure you have the rights to use this music before sharing the video.
        </p>
      )}

      <p className="muted export-options__note">
        The video is made on this computer and nothing is uploaded. You can keep editing while it renders; changes made
        after you start won’t be in this export.
      </p>

      <div className="modal__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={project.scenes.length === 0} autoFocus>
          Start export
        </button>
      </div>
    </form>
  );
}

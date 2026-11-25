import { useState, type FormEvent } from 'react';
import { projectRepository } from '../db';
import {
  DEFAULT_PROJECT_NAME,
  PROJECT_NAME_MAX,
  type FormatPresetId,
  type Project,
} from '../domain/project';
import { DEFAULT_PALETTE_ID } from '../domain/stylePresets';
import { describeError } from '../lib/errors';
import { FormatPicker } from './FormatPicker';
import { Modal } from './Modal';
import { PalettePicker } from './PalettePicker';

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  // Modal only mounts its children while open, so the form starts fresh every time.
  return (
    <Modal open={open} title="New project" onClose={onClose}>
      <NewProjectForm onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

function NewProjectForm({ onClose, onCreated }: Omit<NewProjectDialogProps, 'open'>) {
  const [name, setName] = useState('');
  const [formatPresetId, setFormatPresetId] = useState<FormatPresetId>('story');
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await projectRepository.create({ name, formatPresetId, paletteId });
      onCreated(project);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Project name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={DEFAULT_PROJECT_NAME}
          maxLength={PROJECT_NAME_MAX}
          autoFocus
        />
      </label>

      <FormatPicker value={formatPresetId} onChange={setFormatPresetId} />

      <PalettePicker value={paletteId} onChange={setPaletteId} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal__actions">
        <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}

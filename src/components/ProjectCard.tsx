import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ProjectSummary } from '../db/projectRepository';
import { PROJECT_NAME_MAX } from '../domain/project';
import { formatAspectRatio, formatRelativeTime } from '../lib/format';
import { StoryPreviewTile } from './StoryPreviewTile';

interface ProjectCardProps {
  project: ProjectSummary;
  now: number;
  onRename: (name: string) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => void;
}

export function ProjectCard({ project, now, onRename, onDuplicate, onDelete }: ProjectCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  // Enter submits and unmounts the input, which can also fire blur; commit only once.
  const editingRef = useRef(false);

  const startRename = () => {
    setDraft(project.name);
    editingRef.current = true;
    setRenaming(true);
  };

  const stopRename = () => {
    editingRef.current = false;
    setRenaming(false);
  };

  const submitRename = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!editingRef.current) return;
    stopRename();
    if (draft.trim() !== project.name) await onRename(draft);
  };

  const sceneLabel = project.sceneCount === 1 ? '1 scene' : `${project.sceneCount} scenes`;

  return (
    <article className="project-card">
      <Link to={`/project/${project.id}`} className="project-card__preview" aria-label={`Open ${project.name}`}>
        <StoryPreviewTile
          name={project.name}
          paletteId={project.paletteId}
          width={project.width}
          height={project.height}
        />
      </Link>

      <div className="project-card__body">
        {renaming ? (
          <form onSubmit={submitRename}>
            <input
              ref={inputRef}
              className="project-card__rename"
              aria-label="New project name"
              value={draft}
              maxLength={PROJECT_NAME_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void submitRename()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  stopRename();
                }
              }}
            />
          </form>
        ) : (
          <h3 className="project-card__title">
            <Link to={`/project/${project.id}`}>{project.name}</Link>
          </h3>
        )}
        <p className="project-card__meta">
          {formatAspectRatio(project.width, project.height)} · {sceneLabel} · edited{' '}
          {formatRelativeTime(project.updatedAt, now)}
        </p>

        <div className="project-card__actions">
          <button type="button" className="button button--small" onClick={startRename} aria-label={`Rename ${project.name}`}>
            Rename
          </button>
          <button
            type="button"
            className="button button--small"
            onClick={() => void onDuplicate()}
            aria-label={`Duplicate ${project.name}`}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="button button--small button--danger-text"
            onClick={onDelete}
            aria-label={`Delete ${project.name}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NewProjectDialog } from '../components/NewProjectDialog';
import { ProjectCard } from '../components/ProjectCard';
import { StorageWarning } from '../components/StorageWarning';
import { projectRepository, sweepOrphanedMediaOnce } from '../db';
import { describeError } from '../lib/errors';

/** Re-render every minute so "edited 3 minutes ago" stays fresh. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface PendingDelete {
  id: string;
  name: string;
}

export function ProjectsPage() {
  // Live query: re-runs automatically whenever the projects table changes (even from another tab).
  const list = useLiveQuery(() => projectRepository.list(), []);
  const navigate = useNavigate();
  const now = useNow();

  // Housekeeping: remove media left behind by interrupted imports or failed deletes.
  useEffect(() => sweepOrphanedMediaOnce(), []);

  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  const newProjectButton = (
    <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
      New project
    </button>
  );

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Your projects</h1>
          <p className="page__subtitle">Everything is stored on this computer. Nothing is uploaded.</p>
        </div>
        {newProjectButton}
      </div>

      <StorageWarning />

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {list === undefined ? (
        <p aria-busy="true">Loading projects…</p>
      ) : list.projects.length === 0 && list.broken.length === 0 ? (
        <section className="empty-state">
          <h2>Make your first recap</h2>
          <p>Start a 9:16 story, pick a palette, and you'll be in the editor in seconds.</p>
          {newProjectButton}
        </section>
      ) : (
        <>
          <div className="project-grid">
            {list.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                now={now}
                onRename={(name) => run(() => projectRepository.rename(project.id, name))}
                onDuplicate={() => run(() => projectRepository.duplicate(project.id))}
                onDelete={() => setPendingDelete({ id: project.id, name: project.name })}
              />
            ))}
          </div>

          {list.broken.length > 0 && (
            <section className="broken-projects" aria-label="Projects that can't be opened">
              <h2>Can't open {list.broken.length === 1 ? '1 project' : `${list.broken.length} projects`}</h2>
              <ul>
                {list.broken.map((broken) => (
                  <li key={broken.id}>
                    <span>{broken.reason}</span>
                    <button
                      type="button"
                      className="button button--small button--danger-text"
                      onClick={() => setPendingDelete({ id: broken.id, name: 'this unreadable project' })}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(project) => {
          setCreating(false);
          navigate(`/project/${project.id}`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete project?"
        confirmLabel="Delete project"
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await projectRepository.remove(pendingDelete.id);
        }}
      >
        <p>
          <strong>{pendingDelete?.name}</strong> will be permanently deleted from this computer. This can't be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { assetRepository } from '../db';
import { countAssetReferences, SUPPORTED_MIME_TYPES, type Asset } from '../domain/asset';
import type { Project } from '../domain/project';
import { forgetAsset } from '../editor/sceneActions';
import { assetStatus, importer, mediaCache } from '../media';
import { hasFiles as transferHasFiles } from '../media/dragData';
import type { ImportPhase, ImportResult } from '../media/importAsset';
import { AssetTile } from './AssetTile';
import { ConfirmDialog } from './ConfirmDialog';

/** For the file picker only; the importer checks real content regardless. */
const ACCEPT = [
  ...Object.keys(SUPPORTED_MIME_TYPES),
  ...['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.m4v', '.mov', '.webm'],
  ...['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac'],
].join(',');

interface ImportJob {
  index: number;
  total: number;
  filename: string;
  phase: ImportPhase;
  /** 0–1 while saving. */
  fraction?: number;
}

interface ImportProblem {
  key: string;
  message: string;
}

const PHASE_LABEL: Record<ImportPhase, string> = {
  checking: 'Checking',
  processing: 'Processing',
  saving: 'Saving',
};

const hasFiles = (event: { dataTransfer: DataTransfer | null }) => transferHasFiles(event.dataTransfer);

function summarize(result: ImportResult, total: number): string {
  const cancelled = result.failed.some((f) => f.error.reason === 'cancelled');
  const done = result.imported.length;
  const noun = (n: number) => (n === 1 ? 'file' : 'files');
  if (cancelled) return done > 0 ? `Import cancelled after ${done} ${noun(done)}.` : 'Import cancelled.';
  if (done === total) return `Imported ${done} ${noun(done)}.`;
  return `Imported ${done} of ${total} ${noun(total)}.`;
}

/**
 * Stop the browser from opening a file that is dropped outside the media drop zone, which would
 * navigate away from the editor. Drops the zone handles are already default-prevented.
 */
function useBlockStrayFileDrops() {
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);
}

/** Left panel: the project's imported photos and clips, with import and delete. */
export function MediaLibrary({ project }: { project: Project }) {
  const assets = useLiveQuery(() => assetRepository.listForProject(project.id), [project.id]);
  const usage = countAssetReferences(project, (assets ?? []).map((a) => a.id));

  const [job, setJob] = useState<ImportJob | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const titleId = useId();
  const hintId = useId();

  useBlockStrayFileDrops();

  // Leaving the editor cancels an import in progress.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function startImport(files: File[]) {
    if (abortRef.current || files.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProblems([]);
    setAnnouncement('');
    let lastPercent = -1;
    try {
      const result = await importer.importFiles(files, project.id, {
        signal: controller.signal,
        onFileStart: (file, index) => {
          lastPercent = -1;
          setJob({ index, total: files.length, filename: file.name, phase: 'checking' });
        },
        onProgress: ({ phase, fraction }) => {
          // Large videos report thousands of chunks; only re-render on whole-percent changes.
          const percent = fraction === undefined ? -1 : Math.floor(fraction * 100);
          if (phase === 'saving' && percent === lastPercent) return;
          lastPercent = percent;
          setJob((current) => current && { ...current, phase, fraction });
        },
      });
      setProblems(
        result.failed
          .filter((f) => f.error.reason !== 'cancelled')
          .map((f, i) => ({ key: `${Date.now()}-${i}`, message: f.error.message })),
      );
      setAnnouncement(summarize(result, files.length));
    } finally {
      abortRef.current = null;
      setJob(null);
    }
  }

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = job ? 'none' : 'copy';
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void startImport([...event.dataTransfer.files]);
  };

  const percent = job?.fraction === undefined ? undefined : Math.round(job.fraction * 100);

  return (
    <section
      className={`media-library${dragging ? ' media-library--dragging' : ''}`}
      aria-labelledby={titleId}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="media-library__header">
        <h2 id={titleId} className="panel-title">
          Media
        </h2>
        <button
          type="button"
          className="button button--small"
          onClick={() => inputRef.current?.click()}
          disabled={job !== null}
          aria-describedby={hintId}
        >
          Import…
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          aria-label="Import media files"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = ''; // allow picking the same file again
            void startImport(files);
          }}
        />
      </div>

      <p id={hintId} className="media-library__hint">
        Drop photos, clips or music here. JPEG, PNG, WebP, GIF · MP4, MOV, WebM · MP3, M4A, WAV, OGG, FLAC.
        Files stay on this computer.
      </p>

      {job && (
        <div className="media-import" aria-label="Import progress">
          <div className="media-import__label">
            {PHASE_LABEL[job.phase]} {job.filename}
            {job.total > 1 && ` (${job.index + 1} of ${job.total})`}
            {percent !== undefined && ` · ${percent}%`}
          </div>
          <progress max={100} value={percent} aria-label={`Importing ${job.filename}`} />
          <button type="button" className="button button--ghost button--small" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      )}

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>

      {problems.length > 0 && (
        <div className="media-problems" role="alert">
          <ul>
            {problems.map((problem) => (
              <li key={problem.key}>{problem.message}</li>
            ))}
          </ul>
          <button type="button" className="button button--ghost button--small" onClick={() => setProblems([])}>
            Dismiss
          </button>
        </div>
      )}

      {assets === undefined ? null : assets.length === 0 ? (
        <div className="media-library__empty">No media yet.</div>
      ) : (
        <ul className="asset-grid" aria-label="Media library">
          {assets.map((asset) => (
            <AssetTile key={asset.id} asset={asset} usage={usage.get(asset.id) ?? 0} onDelete={() => setPendingDelete(asset)} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete media?"
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await assetRepository.remove(pendingDelete.id);
          assetStatus.release(pendingDelete.id);
          mediaCache.release(pendingDelete.id);
          forgetAsset(pendingDelete.id);
        }}
      >
        {pendingDelete && <DeleteMessage asset={pendingDelete} usage={usage.get(pendingDelete.id) ?? 0} />}
      </ConfirmDialog>
    </section>
  );
}

function DeleteMessage({ asset, usage }: { asset: Asset; usage: number }) {
  return (
    <>
      <p>
        “{asset.filename}” will be removed from this project and deleted from this computer’s storage. This can’t be
        undone.
      </p>
      {usage > 0 && asset.kind === 'audio' && <p>It’s the story’s music. The story will have no music.</p>}
      {usage > 0 && asset.kind !== 'audio' && (
        <p>
          It’s used in {usage} {usage === 1 ? 'scene' : 'scenes'}. {usage === 1 ? 'That scene' : 'Those scenes'} will
          show an empty media slot.
        </p>
      )}
    </>
  );
}

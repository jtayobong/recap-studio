import { useState, type ReactNode } from 'react';
import type { Project } from '../domain/project';
import { useExportStore } from '../export';
import { formatBytes, formatDuration } from '../lib/format';
import { ExportDialog } from './ExportDialog';

/**
 * Editor header: the Export button, then (while/after exporting) a compact, non-blocking status:
 * progress with Cancel, the finished file with Download, or the error with Try again.
 */
export function ExportControl({ project }: { project: Project }) {
  const state = useExportStore((s) => s.state);
  const { start, cancel, dismiss, markDownloaded } = useExportStore.getState();
  const [choosing, setChoosing] = useState(false);
  const empty = project.scenes.length === 0;

  const exportButton = (
    <button
      type="button"
      // Once a file is ready, Download is the main action; Export steps back.
      className={state.status === 'done' ? 'button button--small' : 'button button--primary button--small'}
      onClick={() => setChoosing(true)}
      disabled={empty}
      title={empty ? 'Add a scene first' : 'Export the story as a video'}
    >
      Export
    </button>
  );

  let status: ReactNode = null;
  if (state.status === 'exporting') {
    const percent = Math.floor(state.fraction * 100);
    status = (
      <>
        <span className="export-status__label">Exporting… {percent}%</span>
        <progress max={100} value={percent} aria-label="Export progress" />
        <button type="button" className="button button--ghost button--small" onClick={cancel}>
          Cancel
        </button>
      </>
    );
  } else if (state.status === 'done') {
    const { file } = state;
    const failures = Object.keys(file.mediaFailures).length;
    status = (
      <>
        <span
          className="export-status__label"
          title={[`${file.totalFrames} frames, made in ${formatDuration(file.elapsedMs)}`, file.music.note].filter(Boolean).join('\n')}
        >
          ✓ {file.filename} ({formatBytes(file.blob.size)})
          {failures > 0 && <span className="export-status__warning"> · {failures} missing media shown as placeholders</span>}
          {file.music.note && <span className="export-status__warning"> · no music</span>}
        </span>
        <a className="button button--primary button--small" href={state.url} download={file.filename} onClick={markDownloaded}>
          Download
        </a>
        <button type="button" className="button button--ghost button--small" onClick={dismiss} aria-label="Dismiss export">
          ✕
        </button>
      </>
    );
  } else if (state.status === 'error') {
    status = (
      <>
        <span className="export-status__label export-status__label--error" title={state.message}>
          Export failed: {state.message}
        </span>
        <button type="button" className="button button--small" onClick={() => void start(project, state.preset)}>
          Try again
        </button>
        <button type="button" className="button button--ghost button--small" onClick={dismiss} aria-label="Dismiss export">
          ✕
        </button>
      </>
    );
  } else if (state.notice) {
    status = <span className="export-status__label muted">{state.notice}</span>;
  }

  return (
    <div className="export-control">
      <div className="export-status" role="status" aria-live="polite" aria-label="Export">
        {status}
      </div>
      {state.status !== 'exporting' && exportButton}
      <ExportDialog
        open={choosing}
        project={project}
        onClose={() => setChoosing(false)}
        onStart={(preset) => {
          setChoosing(false);
          void start(project, preset);
        }}
      />
    </div>
  );
}

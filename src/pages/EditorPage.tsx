import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ExportControl } from '../components/ExportControl';
import { FontPicker } from '../components/FontPicker';
import { MediaLibrary } from '../components/MediaLibrary';
import { MusicSection } from '../components/MusicSection';
import { PalettePicker } from '../components/PalettePicker';
import { SceneInspector } from '../components/SceneInspector';
import { SceneStrip } from '../components/SceneStrip';
import { TemplateGallery } from '../components/TemplateGallery';
import { MAX_SCENES, normalizeProjectName, PROJECT_NAME_MAX, projectDurationMs, type Project } from '../domain/project';
import { indexOfScene } from '../domain/sceneOps';
import { useSelectionStore } from '../editor/selectionStore';
import { useEditorShortcuts } from '../editor/useEditorShortcuts';
import { useExportStore } from '../export';
import { formatAspectRatio } from '../lib/format';
import { assetStatus, mediaCache } from '../media';
import { PlaybackControls } from '../preview/PlaybackControls';
import { PreviewCanvas } from '../preview/PreviewCanvas';
import { PreviewMusic } from '../preview/PreviewMusic';
import { usePlaybackStore } from '../preview/playbackStore';
import { usePlaybackClock } from '../preview/usePlaybackClock';
import { usePlaybackShortcuts } from '../preview/usePlaybackShortcuts';
import { posterTimeMs } from '../render/templates/registry';
import { useEditorStore } from '../store/editorStore';

/**
 * Editor: loads a project, autosaves edits, live preview (M2), scene editing + undo (M3).
 */
export function EditorPage() {
  const { projectId } = useParams();
  const load = useEditorStore((s) => s.load);
  const close = useEditorStore((s) => s.close);
  const flushSave = useEditorStore((s) => s.flushSave);
  const loadState = useEditorStore((s) => s.loadState);
  const loadError = useEditorStore((s) => s.loadError);
  const project = useEditorStore((s) => s.project);

  useEffect(() => {
    if (!projectId) return;
    usePlaybackStore.getState().reset();
    useSelectionStore.setState({ selectedSceneId: null });
    void load(projectId);
    return () => {
      void close();
      // Leaving the editor cancels a running export and frees a finished one.
      useExportStore.getState().cancel();
      useExportStore.getState().dismiss();
      assetStatus.releaseAll(); // free thumbnail object URLs
      mediaCache.releaseAll(); // free decoded images and video elements
    };
  }, [projectId, load, close]);

  // Open on a meaningful frame: the first scene's poster rather than the fade-in at 0:00.
  useEffect(() => {
    if (loadState !== 'ready') return;
    const first = useEditorStore.getState().project?.scenes[0];
    if (first) usePlaybackStore.getState().seek(posterTimeMs(first));
  }, [loadState]);

  // Save when the tab is hidden or closed, and warn if a save hasn't landed yet.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    const onPageHide = () => void flushSave();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditorStore.getState().saveStatus !== 'saved') {
        void flushSave();
        event.preventDefault();
      }
      // Closing the tab would lose a running export.
      if (useExportStore.getState().state.status === 'exporting') event.preventDefault();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flushSave]);

  if (loadState === 'not-found') {
    return (
      <EditorMessage title="Project not found">
        It may have been deleted. <Link to="/">Back to projects</Link>
      </EditorMessage>
    );
  }
  if (loadState === 'error') {
    return (
      <EditorMessage title="This project can't be opened">
        <pre className="error-detail">{loadError}</pre>
        <Link to="/">Back to projects</Link>
      </EditorMessage>
    );
  }
  if (loadState !== 'ready' || !project) {
    return <EditorMessage title="Opening project…" />;
  }

  return <EditorLayout project={project} />;
}

function EditorLayout({ project }: { project: Project }) {
  const update = useEditorStore((s) => s.update);
  const selectedId = useSelectionStore((s) => s.selectedSceneId);
  const durationMs = projectDurationMs(project);
  const selectedIndex = selectedId ? indexOfScene(project.scenes, selectedId) : -1;
  const selectedScene = project.scenes[selectedIndex];

  usePlaybackClock(durationMs);
  usePlaybackShortcuts(durationMs, project.format.fps);
  useEditorShortcuts();

  return (
    <div className="editor">
      <header className="editor__header">
        <Link to="/" className="button button--ghost button--small">
          ← Projects
        </Link>
        <ProjectNameField
          name={project.name}
          onCommit={(name) => update((p) => (p.name === name ? p : { ...p, name }))}
        />
        <UndoRedoButtons />
        <SaveIndicator />
        <ExportControl project={project} />
      </header>

      <div className="editor__body">
        <aside className="editor__panel" aria-label="Templates and media">
          <TemplateGallery disabled={project.scenes.length >= MAX_SCENES} />
          <MediaLibrary project={project} />
        </aside>

        <section className="editor__stage" aria-label="Preview">
          <div className="editor__canvas-slot">
            <PreviewCanvas format={project.format} />
          </div>
          <PlaybackControls durationMs={durationMs} fps={project.format.fps} hasSound={project.audio !== undefined || project.scenes.some((s) => s.fields.clipSound === true)} />
          <PreviewMusic />
        </section>

        <aside className="editor__panel" aria-label="Inspector">
          {selectedScene ? (
            <SceneInspector key={selectedScene.id} project={project} scene={selectedScene} index={selectedIndex} />
          ) : (
            <ProjectPanel project={project} durationMs={durationMs} />
          )}
        </aside>
      </div>

      <footer className="editor__strip" aria-label="Story">
        <SceneStrip project={project} />
      </footer>
    </div>
  );
}

function ProjectPanel({ project, durationMs }: { project: Project; durationMs: number }) {
  const update = useEditorStore((s) => s.update);
  return (
    <>
      <h2 className="panel-title">Project</h2>
      <dl className="facts">
        <dt>Format</dt>
        <dd>
          {formatAspectRatio(project.format.width, project.format.height)} · {project.format.width}×
          {project.format.height} · {project.format.fps} fps
        </dd>
        <dt>Scenes</dt>
        <dd>
          {project.scenes.length} ({(durationMs / 1000).toFixed(1)} s)
        </dd>
      </dl>

      <PalettePicker
        legend="Palette"
        value={project.style.paletteId}
        onChange={(paletteId) =>
          update((p) => (p.style.paletteId === paletteId ? p : { ...p, style: { ...p.style, paletteId } }))
        }
      />

      <FontPicker
        value={project.style.fontPairId}
        onChange={(fontPairId) =>
          update((p) => (p.style.fontPairId === fontPairId ? p : { ...p, style: { ...p.style, fontPairId } }))
        }
      />

      <MusicSection project={project} />

      <p className="muted inspector__tip">Select a scene in the strip below to edit its text and timing.</p>

      <details className="debug">
        <summary>Project data (debug)</summary>
        <pre>{JSON.stringify(project, null, 2)}</pre>
      </details>
    </>
  );
}

function UndoRedoButtons() {
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  return (
    <div className="undo-redo" role="group" aria-label="History">
      <button type="button" className="button button--small" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶ Undo
      </button>
      <button type="button" className="button button--small" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        ↷ Redo
      </button>
    </div>
  );
}

function ProjectNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  // null = not editing, so the field always shows the current name (e.g. after undo later).
  const [draft, setDraft] = useState<string | null>(null);
  // Escape reverts; the blur it triggers must not commit the abandoned text.
  const cancelledRef = useRef(false);

  // Blur is the single commit point: Enter and Escape both just blur the input.
  const handleBlur = () => {
    const text = draft;
    setDraft(null);
    if (cancelledRef.current || text === null) {
      cancelledRef.current = false;
      return;
    }
    onCommit(normalizeProjectName(text));
  };

  return (
    <form
      className="editor__name"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        event.currentTarget.querySelector('input')?.blur();
      }}
    >
      <input
        aria-label="Project name"
        value={draft ?? name}
        maxLength={PROJECT_NAME_MAX}
        onFocus={() => setDraft(name)}
        onBlur={handleBlur}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancelledRef.current = true;
            event.currentTarget.blur();
          }
        }}
      />
    </form>
  );
}

function SaveIndicator() {
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const saveError = useEditorStore((s) => s.saveError);
  const flushSave = useEditorStore((s) => s.flushSave);

  return (
    <div className={`save-indicator save-indicator--${saveStatus}`} role="status" aria-live="polite">
      {saveStatus === 'saved' && 'All changes saved'}
      {saveStatus === 'unsaved' && 'Unsaved changes'}
      {saveStatus === 'saving' && 'Saving…'}
      {saveStatus === 'error' && (
        <>
          <span title={saveError ?? undefined}>Couldn't save</span>
          <button type="button" className="button button--small" onClick={() => void flushSave()}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}

function EditorMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="fullscreen-message">
      <h1>{title}</h1>
      {children && <div>{children}</div>}
    </main>
  );
}

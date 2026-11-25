import { useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Project } from '../domain/project';
import { addStarterScenes, deleteScene, moveSceneBy, moveSceneTo, selectScene } from '../editor/sceneActions';
import { useSelectionStore } from '../editor/selectionStore';
import { usePlaybackStore } from '../preview/playbackStore';
import { getTemplate } from '../render/templates/registry';
import { formatTimecode, getSceneSpans, locateScene, totalDurationMs } from '../render/timeline';
import { SceneThumbnail } from './SceneThumbnail';

const DRAG_TYPE = 'application/x-recap-scene';

/**
 * The story strip: scenes in order, with thumbnails.
 * Click to select · drag to reorder · Alt+←/→ to move · Delete to remove.
 */
export function SceneStrip({ project }: { project: Project }) {
  const timeMs = usePlaybackStore((s) => s.timeMs);
  const selectedId = useSelectionStore((s) => s.selectedSceneId);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const spans = getSceneSpans(project.scenes);
  const playingIndex = locateScene(spans, timeMs)?.span.index ?? -1;

  if (project.scenes.length === 0) {
    return (
      <div className="scene-strip scene-strip--empty">
        <p>Your story is empty. Start from the starter story, or add scenes from the left.</p>
        <button type="button" className="button button--primary" onClick={addStarterScenes}>
          Add starter scenes
        </button>
      </div>
    );
  }

  /** Gap index (0…n) the pointer is over: left or right half of a chip. */
  const gapFromEvent = (event: DragEvent<HTMLElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? index : index + 1;
  };

  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const from = dragFrom;
    const gap = dropAt;
    endDrag();
    const scene = from === null ? undefined : project.scenes[from];
    if (from === null || gap === null || !scene) return;
    // Removing the dragged scene shifts later gaps one to the left.
    moveSceneTo(scene.id, gap > from ? gap - 1 : gap);
  };

  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>, sceneId: string) => {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      moveSceneBy(sceneId, event.key === 'ArrowLeft' ? -1 : 1);
      // Keep focus on the moved chip after React re-renders the list.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-scene-id="${sceneId}"]`)?.focus());
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteScene(sceneId);
    }
  };

  return (
    <div className="scene-strip">
      <ol className="scene-strip__list" aria-label="Scenes" onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
        {spans.map(({ scene, index }) => {
          const template = getTemplate(scene.templateId);
          const classes = [
            'scene-chip',
            scene.id === selectedId && 'scene-chip--selected',
            index === playingIndex && 'scene-chip--playing',
            index === dragFrom && 'scene-chip--dragging',
            dropAt === index && 'scene-chip--drop-before',
            dropAt === index + 1 && index === spans.length - 1 && 'scene-chip--drop-after',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={scene.id}>
              <button
                type="button"
                className={classes}
                data-scene-id={scene.id}
                aria-pressed={scene.id === selectedId}
                aria-current={index === playingIndex ? 'step' : undefined}
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Delete"
                title="Click to edit · drag or Alt+←/→ to move · Delete to remove"
                draggable
                onClick={() => selectScene(scene.id)}
                onKeyDown={(event) => onChipKeyDown(event, scene.id)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(DRAG_TYPE, scene.id);
                  setDragFrom(index);
                }}
                onDragOver={(event) => {
                  if (dragFrom === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropAt(gapFromEvent(event, index));
                }}
                onDrop={onDrop}
                onDragEnd={endDrag}
              >
                <SceneThumbnail scene={scene} format={project.format} style={project.style} />
                <span className="scene-chip__meta">
                  <span className="scene-chip__index">{index + 1}</span>
                  <span className="scene-chip__name">{template?.name ?? 'Unknown'}</span>
                  <span className="scene-chip__duration">{(scene.durationMs / 1000).toFixed(1)}s</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="scene-strip__total">
        {spans.length} {spans.length === 1 ? 'scene' : 'scenes'} · {formatTimecode(totalDurationMs(spans))}
      </p>
    </div>
  );
}

import { useId } from 'react';
import { SCENE_MAX_MS, SCENE_MIN_MS, type Project, type Scene, type Transition } from '../domain/project';
import {
  canAddScene,
  deleteScene,
  duplicateScene,
  moveSceneBy,
  selectScene,
  setSceneDuration,
  setSceneField,
  setSceneFields,
  setSceneTransition,
} from '../editor/sceneActions';
import { fieldsEditedBySlots, resolveFields, type FieldDef } from '../render/fields';
import type { FocusBinding } from './FocusPicker';
import { getTemplate } from '../render/templates/registry';
import { FieldEditor, NumberInput } from './FieldEditor';

const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide up' },
  { value: 'push', label: 'Push left' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'flash', label: 'Flash' },
];

interface SceneInspectorProps {
  project: Project;
  scene: Scene;
  index: number;
}

/** Edits one scene. The content form is generated from the template's field descriptors. */
export function SceneInspector({ project, scene, index }: SceneInspectorProps) {
  const template = getTemplate(scene.templateId);
  const transitionId = useId();
  const durationId = useId();
  const isFirst = index === 0;
  const isLast = index === project.scenes.length - 1;

  return (
    <div className="inspector">
      <div className="inspector__header">
        <h2 className="panel-title">
          Scene {index + 1} · {template?.name ?? 'Unknown'}
        </h2>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => selectScene(null, { show: false })}
          title="Back to project settings (Esc)"
        >
          Done
        </button>
      </div>

      <div className="inspector__actions" role="group" aria-label="Scene actions">
        <button type="button" className="button button--small" onClick={() => moveSceneBy(scene.id, -1)} disabled={isFirst}>
          ← Move earlier
        </button>
        <button type="button" className="button button--small" onClick={() => moveSceneBy(scene.id, 1)} disabled={isLast}>
          Move later →
        </button>
        <button type="button" className="button button--small" onClick={() => duplicateScene(scene.id)} disabled={!canAddScene()}>
          Duplicate
        </button>
        <button type="button" className="button button--small button--danger-text" onClick={() => deleteScene(scene.id)}>
          Delete
        </button>
      </div>

      <section className="inspector__section" aria-labelledby={`${durationId}-heading`}>
        <h3 id={`${durationId}-heading`} className="inspector__heading">
          Timing
        </h3>
        <div className="field">
          <label className="field__label" htmlFor={durationId}>
            Duration (seconds)
          </label>
          <NumberInput
            id={durationId}
            value={scene.durationMs / 1000}
            min={SCENE_MIN_MS / 1000}
            max={SCENE_MAX_MS / 1000}
            step={0.1}
            onChange={(seconds) => setSceneDuration(scene.id, seconds * 1000)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={transitionId}>
            Transition in
          </label>
          <select
            id={transitionId}
            value={scene.transitionIn}
            onChange={(event) => setSceneTransition(scene.id, event.target.value as Transition)}
          >
            {TRANSITIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {isFirst && scene.transitionIn !== 'cut' && (
            <p className="field__hint">The first scene transitions in from the background.</p>
          )}
        </div>
      </section>

      <section className="inspector__section" aria-label="Content">
        <h3 className="inspector__heading">Content</h3>
        {template ? (
          <SceneFields scene={scene} project={project} />
        ) : (
          <p className="muted">
            This scene uses a template (“{scene.templateId}”) that this version of the app doesn't have.
          </p>
        )}
      </section>
    </div>
  );
}

function SceneFields({ scene, project }: { scene: Scene; project: Project }) {
  const template = getTemplate(scene.templateId);
  if (!template) return null;
  const values = resolveFields(template.fields, scene.fields);
  const skip = fieldsEditedBySlots(template.fields);

  const focusFor = (def: FieldDef, key: string): FocusBinding | undefined => {
    if (def.kind !== 'media' || !def.focus) return undefined;
    const { x, y, fit, aspect } = def.focus;
    const cropped = fit === undefined || values[fit] === 'cover';
    const slotAspect = aspect ? aspect.byValue[String(values[aspect.field])] : undefined;
    return {
      x: Number(values[x]),
      y: Number(values[y]),
      cropAspect: cropped ? (slotAspect ?? project.format.width / project.format.height) : undefined,
      onChange: (nx, ny, gesture) => setSceneFields(scene.id, { [x]: nx, [y]: ny }, `focus:${key}:${gesture}`),
    };
  };

  return (
    <div className="form">
      {Object.entries(template.fields)
        .filter(([key]) => !skip.has(key))
        .map(([key, def]) => (
          <FieldEditor
            key={key}
            def={def}
            value={values[key] as string | number | boolean}
            onChange={(value) => setSceneField(scene.id, key, value)}
            projectId={project.id}
            focus={focusFor(def, key)}
          />
        ))}
    </div>
  );
}

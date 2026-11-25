import { addScene } from '../editor/sceneActions';
import { TEMPLATES } from '../render/templates/registry';

/** Left panel: add a scene from a template (inserted after the selected scene). */
export function TemplateGallery({ disabled }: { disabled: boolean }) {
  return (
    <section aria-labelledby="template-gallery-title">
      <h2 id="template-gallery-title" className="panel-title">
        Add a scene
      </h2>
      <ul className="template-list">
        {TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="template-card"
              onClick={() => addScene(template.id)}
              disabled={disabled}
              aria-describedby={`template-desc-${template.id}`}
            >
              <span className="template-card__name">+ {template.name}</span>
              <span id={`template-desc-${template.id}`} className="template-card__desc">
                {template.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

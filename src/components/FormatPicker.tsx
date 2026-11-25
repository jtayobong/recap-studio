import { FORMAT_PRESETS, type FormatPresetId } from '../domain/project';

type PresetEntry = [FormatPresetId, (typeof FORMAT_PRESETS)[FormatPresetId]];

interface FormatPickerProps {
  value: FormatPresetId | undefined;
  onChange: (presetId: FormatPresetId) => void;
  /** Radio group name; must be unique on the page. */
  name?: string;
  /** Hide presets that aren't available yet (the editor shows only what can be chosen). */
  hideDisabled?: boolean;
}

/** Output shape as radio cards with a little frame preview (Story 9:16, Landscape 16:9, …). */
export function FormatPicker({ value, onChange, name = 'format', hideDisabled = false }: FormatPickerProps) {
  const presets = (Object.entries(FORMAT_PRESETS) as PresetEntry[]).filter(([, preset]) => preset.enabled || !hideDisabled);
  return (
    <fieldset className="format-picker">
      <legend>Format</legend>
      <div className="format-picker__options">
        {presets.map(([id, preset]) => (
          <label key={id} className={`format-option${preset.enabled ? '' : ' format-option--disabled'}`}>
            <input
              type="radio"
              name={name}
              value={id}
              checked={value === id}
              disabled={!preset.enabled}
              onChange={() => onChange(id)}
              className="visually-hidden"
            />
            <span className="format-option__shape" style={{ aspectRatio: `${preset.width} / ${preset.height}` }} aria-hidden="true" />
            <span className="format-option__label">
              {preset.label} <small>{preset.ratio}</small>
            </span>
            {!preset.enabled && <span className="format-option__soon">Later</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import { PALETTES } from '../domain/stylePresets';

interface PalettePickerProps {
  value: string;
  onChange: (paletteId: string) => void;
  legend?: string;
}

export function PalettePicker({ value, onChange, legend = 'Color palette' }: PalettePickerProps) {
  return (
    <fieldset className="palette-picker">
      <legend>{legend}</legend>
      <div className="palette-picker__options">
        {PALETTES.map((palette) => (
          <label key={palette.id} className="palette-option">
            <input
              type="radio"
              name="palette"
              value={palette.id}
              checked={value === palette.id}
              onChange={() => onChange(palette.id)}
              className="visually-hidden"
            />
            <span className="palette-option__swatch" aria-hidden="true">
              {(['background', 'primary', 'accent', 'text'] as const).map((role) => (
                // Keyed by role: a palette may use one colour twice (Mono Ink's primary and text).
                <span key={role} style={{ background: palette[role] }} />
              ))}
            </span>
            <span className="palette-option__name">{palette.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

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
              {[palette.background, palette.primary, palette.accent, palette.text].map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </span>
            <span className="palette-option__name">{palette.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

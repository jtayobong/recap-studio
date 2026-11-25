import { FONT_PAIRS } from '../domain/stylePresets';

interface FontPickerProps {
  value: string;
  onChange: (fontPairId: string) => void;
  legend?: string;
}

/** Choose the story's font pair; each option previews its display font. */
export function FontPicker({ value, onChange, legend = 'Fonts' }: FontPickerProps) {
  return (
    <fieldset className="font-picker">
      <legend>{legend}</legend>
      <div className="font-picker__options">
        {FONT_PAIRS.map((pair) => (
          <label key={pair.id} className="font-option">
            <input
              type="radio"
              name="font-pair"
              value={pair.id}
              checked={value === pair.id}
              onChange={() => onChange(pair.id)}
              className="visually-hidden"
            />
            <span className="font-option__sample" aria-hidden="true" style={{ fontFamily: pair.display }}>
              Aa 2026
            </span>
            <span className="font-option__name">{pair.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

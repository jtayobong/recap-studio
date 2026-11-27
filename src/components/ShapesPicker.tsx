import type { BackgroundShapes } from '../domain/project';

interface ShapesPickerProps {
  value: BackgroundShapes;
  onChange: (shapes: BackgroundShapes) => void;
  /** Background motion is off, so there are no shapes to choose. */
  disabled?: boolean;
}

const OPTIONS: readonly { value: BackgroundShapes; name: string; sample: string; hint: string }[] = [
  { value: 'geometric', name: 'Geometric', sample: '● ○ □', hint: 'Circles, rings, squares and dots' },
  { value: 'fiesta', name: 'Fiesta', sample: '▼ ★ ✹', hint: 'Banderitas, parol stars, suns and stars' },
];

/** Choose which shapes the background motion draws (M12.3). */
export function ShapesPicker({ value, onChange, disabled = false }: ShapesPickerProps) {
  return (
    <fieldset className="font-picker motion-picker" disabled={disabled}>
      <legend>Background shapes</legend>
      <div className="font-picker__options">
        {OPTIONS.map((option) => (
          <label key={option.value} className="font-option" title={option.hint}>
            <input
              type="radio"
              name="background-shapes"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="visually-hidden"
            />
            <span className="font-option__sample" aria-hidden="true">
              {option.sample}
            </span>
            <span className="font-option__name">{option.name}</span>
          </label>
        ))}
      </div>
      {disabled && <p className="field__hint">Turn on background motion to show shapes.</p>}
    </fieldset>
  );
}

import type { BackgroundMotion } from '../domain/project';

interface MotionPickerProps {
  value: BackgroundMotion;
  onChange: (motion: BackgroundMotion) => void;
}

const OPTIONS: readonly { value: BackgroundMotion; name: string; sample: string; hint: string }[] = [
  { value: 'off', name: 'Off', sample: '—', hint: 'Plain backgrounds' },
  { value: 'subtle', name: 'Subtle', sample: '○ ·', hint: 'A few slowly drifting shapes' },
  { value: 'lively', name: 'Lively', sample: '● ○ ◇', hint: 'More shapes, moving faster' },
];

/** Choose how much moves behind every scene (M11). */
export function MotionPicker({ value, onChange }: MotionPickerProps) {
  return (
    <fieldset className="font-picker motion-picker">
      <legend>Background motion</legend>
      <div className="font-picker__options">
        {OPTIONS.map((option) => (
          <label key={option.value} className="font-option" title={option.hint}>
            <input
              type="radio"
              name="background-motion"
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
    </fieldset>
  );
}

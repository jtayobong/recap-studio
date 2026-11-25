import { useId, useState } from 'react';
import type { FieldDef } from '../render/fields';

interface FieldEditorProps {
  def: FieldDef;
  /** Already resolved through resolveFields, so it matches the field's type. */
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}

/** One inspector control, chosen from the template's field descriptor. */
export function FieldEditor({ def, value, onChange }: FieldEditorProps) {
  const id = useId();

  switch (def.kind) {
    case 'text': {
      const text = String(value);
      return (
        <div className="field">
          <div className="field__row">
            <label className="field__label" htmlFor={id}>
              {def.label}
            </label>
            <span className="field__counter" aria-hidden="true">
              {text.length}/{def.maxLength}
            </span>
          </div>
          {def.multiline ? (
            <textarea
              id={id}
              rows={3}
              value={text}
              maxLength={def.maxLength}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <input
              id={id}
              type="text"
              value={text}
              maxLength={def.maxLength}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </div>
      );
    }

    case 'number':
      return (
        <div className="field">
          <label className="field__label" htmlFor={id}>
            {def.label}
          </label>
          <NumberInput id={id} value={Number(value)} min={def.min} max={def.max} step={def.step} onChange={onChange} />
        </div>
      );

    case 'boolean':
      return (
        <label className="field field--inline">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
          <span className="field__label">{def.label}</span>
        </label>
      );

    case 'choice':
      return (
        <div className="field">
          <label className="field__label" htmlFor={id}>
            {def.label}
          </label>
          <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
            {def.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
  }
}

interface NumberInputProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Accessible name, when there is no <label for>. */
  ariaLabel?: string;
}

/**
 * Number field that lets the user type freely (including an empty box or "1.")
 * and only commits valid, in-range values. Shows the stored value when not focused.
 */
export function NumberInput({ id, value, min, max, step, onChange, ariaLabel }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = Number(text);
        if (text.trim() !== '' && Number.isFinite(parsed)) {
          onChange(Math.min(max, Math.max(min, parsed)));
        }
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

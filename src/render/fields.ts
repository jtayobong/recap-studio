import { AssetIdSchema, type AssetKind } from '../domain/asset';

/**
 * Template field descriptors.
 *
 * Each template declares its editable fields here. The same descriptors are used to:
 *  - resolve stored values safely for rendering (never throws; bad values fall back to defaults)
 *  - generate the inspector form automatically (M3); `media` slots get a library picker (M4)
 */

export interface TextField {
  kind: 'text';
  label: string;
  default: string;
  maxLength: number;
  multiline?: boolean;
}

export interface NumberField {
  kind: 'number';
  label: string;
  default: number;
  min: number;
  max: number;
  /** Values are rounded to this step (1 = integers). */
  step: number;
}

export interface BooleanField {
  kind: 'boolean';
  label: string;
  default: boolean;
}

export interface ChoiceField {
  kind: 'choice';
  label: string;
  default: string;
  options: readonly { value: string; label: string }[];
}

/**
 * A slot for an imported asset. The value is the asset id, or '' when empty. Resolving only checks
 * that the id is well-formed; whether the asset exists (and is of an accepted kind) is decided at
 * draw time by the media resolver, which falls back to a placeholder.
 */
export interface MediaField {
  kind: 'media';
  label: string;
  default: '';
  accept: readonly AssetKind[];
  /**
   * Optional crop focus point: names of two `number` fields (0–1) that the inspector edits with a
   * focus picker inside this slot instead of as separate inputs. `fit` names a `choice` field
   * whose value 'cover' means the media is cropped (the picker then shows the visible area).
   */
  focus?: {
    x: string;
    y: string;
    fit?: string;
    /**
     * Shape of the visible area when it isn't the whole frame (grid cells, carousel cards):
     * width ÷ height per value of a `choice` field, e.g. `{ field: 'layout', byValue: { two: 1.1 } }`.
     */
    aspect?: { field: string; byValue: Readonly<Record<string, number>> };
  };
}

/** Field keys that a media slot edits itself (its focus point), so the form skips them. */
export function fieldsEditedBySlots(defs: FieldDefs): Set<string> {
  const keys = new Set<string>();
  for (const def of Object.values(defs)) {
    if (def.kind === 'media' && def.focus) {
      keys.add(def.focus.x);
      keys.add(def.focus.y);
    }
  }
  return keys;
}

export type FieldDef = TextField | NumberField | BooleanField | ChoiceField | MediaField;
export type FieldDefs = Record<string, FieldDef>;

type ValueOf<F extends FieldDef> = F extends NumberField ? number : F extends BooleanField ? boolean : string;

export type FieldValues<D extends FieldDefs> = { [K in keyof D]: ValueOf<D[K]> };

function resolveOne(def: FieldDef, raw: unknown): string | number | boolean {
  switch (def.kind) {
    case 'text': {
      if (typeof raw !== 'string') return def.default;
      const normalized = def.multiline ? raw.replace(/\r\n?/g, '\n') : raw.replace(/\s*\n\s*/g, ' ');
      return normalized.slice(0, def.maxLength);
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return def.default;
      const stepped = Math.round(raw / def.step) * def.step;
      // Avoid 0.30000000000000004-style noise from the step multiplication.
      const decimals = (String(def.step).split('.')[1] ?? '').length;
      return Math.min(def.max, Math.max(def.min, Number(stepped.toFixed(decimals))));
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : def.default;
    case 'choice':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw) ? raw : def.default;
    case 'media':
      return typeof raw === 'string' && AssetIdSchema.safeParse(raw).success ? raw : '';
  }
}

/** Turn stored (untrusted) field data into complete, valid values. Unknown keys are dropped. */
export function resolveFields<D extends FieldDefs>(defs: D, raw: Record<string, unknown> | undefined): FieldValues<D> {
  const values: Record<string, string | number | boolean> = {};
  for (const [key, def] of Object.entries(defs)) {
    values[key] = resolveOne(def, raw?.[key]);
  }
  return values as FieldValues<D>;
}

export function defaultFields<D extends FieldDefs>(defs: D): FieldValues<D> {
  return resolveFields(defs, undefined);
}

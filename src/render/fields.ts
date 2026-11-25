import { AssetIdSchema, type AssetKind } from '../domain/asset';

/**
 * Template field descriptors.
 *
 * Each template declares its editable fields here. The same descriptors are used to:
 *  - resolve stored values safely for rendering (never throws; bad values fall back to defaults)
 *  - generate the inspector form automatically (M3); `media` slots get a library picker (M4)
 */

/** Properties every field kind shares. */
interface FieldBase {
  /** Show this field in the inspector only when the condition holds (see `isFieldVisible`). */
  visibleWhen?: VisibleWhen;
}

export interface TextField extends FieldBase {
  kind: 'text';
  label: string;
  default: string;
  maxLength: number;
  multiline?: boolean;
}

export interface NumberField extends FieldBase {
  kind: 'number';
  label: string;
  default: number;
  min: number;
  max: number;
  /** Values are rounded to this step (1 = integers). */
  step: number;
}

export interface BooleanField extends FieldBase {
  kind: 'boolean';
  label: string;
  default: boolean;
}

export interface ChoiceField extends FieldBase {
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
export interface MediaField extends FieldBase {
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
     * width ÷ height per frame shape and per value of a `choice` field, e.g.
     * `{ field: 'layout', byShape: { portrait: { two: 1.1 }, landscape: { two: 0.9 } } }`.
     */
    aspect?: { field: string; byShape: Readonly<Record<FrameShape, Readonly<Record<string, number>>>> };
  };
}

export type FrameShape = 'portrait' | 'landscape';

/**
 * Crop shape (width ÷ height) of a media slot in a frame of `format`: the slot's own shape for the
 * current choice value when it has one, otherwise the whole frame.
 */
export function slotCropAspect(
  focus: NonNullable<MediaField['focus']>,
  values: Readonly<Record<string, unknown>>,
  format: { width: number; height: number },
): number {
  const shape: FrameShape = format.width > format.height ? 'landscape' : 'portrait';
  const own = focus.aspect?.byShape[shape][String(values[focus.aspect.field])];
  return own ?? format.width / format.height;
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

/**
 * When the inspector shows a field (plain data; hidden fields keep their values):
 * `{ field, oneOf }`: another field's value is one of these; `{ field, filled: true }`: another
 * field is not empty; `{ anyOf }`: any of the conditions holds.
 */
export type VisibleWhen =
  | { field: string; oneOf: readonly string[] }
  | { field: string; filled: true }
  | { anyOf: readonly VisibleWhen[] };

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

/** Whether the inspector shows `def` given the scene's resolved values. */
export function isFieldVisible(def: FieldDef, values: Readonly<Record<string, unknown>>): boolean {
  return def.visibleWhen === undefined || conditionHolds(def.visibleWhen, values);
}

function conditionHolds(condition: VisibleWhen, values: Readonly<Record<string, unknown>>): boolean {
  if ('anyOf' in condition) return condition.anyOf.some((c) => conditionHolds(c, values));
  const value = values[condition.field];
  if ('oneOf' in condition) return condition.oneOf.includes(String(value));
  return value !== undefined && value !== '' && value !== false;
}

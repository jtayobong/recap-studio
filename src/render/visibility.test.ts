import { describe, expect, it } from 'vitest';
import { isFieldVisible, resolveFields, type FieldDef } from './fields';
import { getTemplate } from './templates/registry';

const text = (visibleWhen?: FieldDef['visibleWhen']): FieldDef => ({ kind: 'text', label: 'x', default: '', maxLength: 10, visibleWhen });

describe('isFieldVisible', () => {
  it('shows fields without a condition', () => {
    expect(isFieldVisible(text(), {})).toBe(true);
  });

  it('oneOf / filled / anyOf', () => {
    expect(isFieldVisible(text({ field: 'layout', oneOf: ['four'] }), { layout: 'four' })).toBe(true);
    expect(isFieldVisible(text({ field: 'layout', oneOf: ['four'] }), { layout: 'two' })).toBe(false);
    expect(isFieldVisible(text({ field: 'media1', filled: true }), { media1: 'abc' })).toBe(true);
    expect(isFieldVisible(text({ field: 'media1', filled: true }), { media1: '' })).toBe(false);
    expect(isFieldVisible(text({ anyOf: [{ field: 'a', filled: true }, { field: 'b', filled: true }] }), { a: '', b: 'x' })).toBe(true);
  });
});

/** Labels of the inspector fields a template shows for `fields` (as SceneInspector filters them). */
function visibleLabels(templateId: string, fields: Record<string, unknown>): string[] {
  const template = getTemplate(templateId)!;
  const values = resolveFields(template.fields, fields);
  return Object.values(template.fields)
    .filter((def) => isFieldVisible(def, values))
    .map((def) => def.label);
}

describe('media slot visibility', () => {
  it('Photo grid shows only the slots its layout uses (and filled ones)', () => {
    const slots = (fields: Record<string, unknown>) => visibleLabels('photo-grid', fields).filter((l) => /^Photo \d$/.test(l));
    expect(slots({ layout: 'two' })).toEqual(['Photo 1', 'Photo 2']);
    expect(slots({ layout: 'three' })).toEqual(['Photo 1', 'Photo 2', 'Photo 3']);
    expect(slots({ layout: 'four' })).toEqual(['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4']);
    // Switching to a smaller layout keeps a filled slot visible, so its media can be cleared.
    expect(slots({ layout: 'two', media4: '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11' })).toEqual(['Photo 1', 'Photo 2', 'Photo 4']);
    expect(visibleLabels('photo-grid', { layout: 'two' })).not.toContain('Photo 3 fit');
  });

  it('carousel reveals the next slot as the previous one is filled', () => {
    const id = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
    const slots = (fields: Record<string, unknown>) => visibleLabels('carousel', fields).filter((l) => /^Photo \d$/.test(l));
    expect(slots({})).toEqual(['Photo 1']);
    expect(slots({ media1: id })).toEqual(['Photo 1', 'Photo 2']);
    expect(slots({ media1: id, media2: id, media3: id })).toEqual(['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4']);
    expect(slots({ media5: id })).toEqual(['Photo 1', 'Photo 5', 'Photo 6']); // filled slots stay
  });
});

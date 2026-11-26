import { describe, expect, it } from 'vitest';
import { filledSlots, perItemText } from './mediaSequence';

const ID = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
const SEQ = ['media1', 'media2', 'media3', 'media4'];

describe('media sequence', () => {
  it('lists filled slots in slot order', () => {
    expect(filledSlots(SEQ, {})).toEqual([]);
    expect(filledSlots(SEQ, { media3: ID, media1: ID, media2: '', title: 'x' })).toEqual(['media1', 'media3']);
  });

  it('says how long each item is on screen', () => {
    expect(perItemText(0, 6000)).toBe('Add photos or clips to fill the strip.');
    expect(perItemText(1, 6000)).toBe('1 photo or clip · about 6.0 s each');
    expect(perItemText(4, 6000)).toBe('4 photos and clips · about 1.5 s each');
    expect(perItemText(12, 6000)).toBe('12 photos and clips · about 0.5 s each');
    expect(perItemText(1, 30_000)).toBe('1 photo or clip · about 30 s each');
  });
});

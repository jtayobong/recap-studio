import { describe, expect, it } from 'vitest';
import { NO_MEDIA } from '../media';
import { createMockContext } from '../testing/mockContext';
import { percentChange } from './compare';
import { OUTRO_END_MS } from './outro';
import { getTemplate } from './registry';

const theme = {
  palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
};

function draw(templateId: string, fields: Record<string, unknown>, localMs: number, durationMs = 5000) {
  const mock = createMockContext();
  getTemplate(templateId)!.draw(mock.ctx, { width: 1080, height: 1920, localMs, durationMs, media: NO_MEDIA }, fields, theme);
  return mock;
}

describe('Top 5', () => {
  it('lists items in rank order once they have entered, skipping empty ones', () => {
    const { texts } = draw('top-list', { title: 'Top places', item1: 'Lisbon', item2: '', item3: 'Kyoto', item4: 'Oslo', item5: '' }, 4000);
    expect(texts()).toEqual(['Top places', '1', 'Lisbon', '3', 'Kyoto', '4', 'Oslo']);
  });

  it('builds up one item at a time', () => {
    const at = (ms: number) => draw('top-list', {}, ms).texts().filter((t) => /^[1-5]$/.test(t)).length;
    expect(at(0)).toBe(0);
    expect(at(800)).toBeLessThan(at(1400));
    expect(at(3000)).toBe(5);
  });
});

describe('Compare', () => {
  it('formats the percent change', () => {
    expect(percentChange(12, 19)).toBe('+58%');
    expect(percentChange(20, 15)).toBe('-25%');
    expect(percentChange(5, 5)).toBe('0%');
    expect(percentChange(0, 10)).toBe('');
    expect(percentChange(1000, 251_000)).toBe('+25,000%');
  });

  it('counts both numbers up and shows the change once settled', () => {
    const fields = { leftValue: 1200, rightValue: 3400, unit: 'km', leftLabel: '2025', rightLabel: '2026' };
    expect(draw('compare', fields, 4000).texts()).toEqual(expect.arrayContaining(['2025', '2026', '1,200 km', '3,400 km', '+183%']));
    expect(draw('compare', fields, 500).texts()).not.toContain('3,400 km');
    expect(draw('compare', { ...fields, showChange: false }, 4000).texts()).not.toContain('+183%');
  });

  it('emphasises the bigger number with the accent colour', () => {
    const { calls } = draw('compare', { leftValue: 5, rightValue: 9, unit: '' }, 4000);
    const colourOf = (text: string) => calls.find((c) => c.method === 'fillText' && c.args[0] === text)?.state.fillStyle;
    expect(colourOf('9')).toBe(theme.palette.accent);
    expect(colourOf('5')).toBe(theme.palette.text);
  });
});

describe('Outro', () => {
  const fills = (mock: ReturnType<typeof draw>) => mock.calls.filter((c) => c.method === 'fillRect');

  it('fades to the background only during the last moments of the scene', () => {
    expect(fills(draw('outro', {}, 2000, 4500))).toHaveLength(1); // just the background
    const nearEnd = fills(draw('outro', {}, 4500 - OUTRO_END_MS / 3, 4500));
    expect(nearEnd).toHaveLength(2);
    expect(nearEnd[1]!.state.globalAlpha).toBeGreaterThan(0.2);
    expect(nearEnd[1]!.state.globalAlpha).toBeLessThan(1);
  });

  it('can end without fading', () => {
    expect(fills(draw('outro', { fadeToBlack: false }, 4490, 4500))).toHaveLength(1);
  });
});

describe('Photo grid', () => {
  const ID = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
  const image = { source: {} as CanvasImageSource, width: 800, height: 600, kind: 'image' as const };
  const withMedia = (fields: Record<string, unknown>, localMs = 2000) => {
    const mock = createMockContext();
    const media = { frame: (id: string) => (id === ID ? image : undefined) };
    getTemplate('photo-grid')!.draw(mock.ctx, { width: 1080, height: 1920, localMs, durationMs: 4500, media }, fields, theme);
    return mock;
  };

  it('shows as many cells as the layout has, media where set and numbered placeholders elsewhere', () => {
    for (const [layout, cells] of [['two', 2], ['three', 3], ['four', 4]] as const) {
      const { calls, texts } = withMedia({ layout, media1: ID, media3: ID });
      const drawn = calls.filter((c) => c.method === 'drawImage').length;
      const placeholders = texts().filter((t) => /^Photo \d$/.test(t));
      expect(drawn + placeholders.length, layout).toBe(cells);
    }
    expect(withMedia({ layout: 'four', media1: ID }).texts()).toEqual(['Photo 2', 'Photo 3', 'Photo 4']);
  });

  it('gives each slot the crop shape of its cell, per layout, for the focus picker', async () => {
    const { gridCells, STORY_SIZE } = await import('./mediaLayout');
    const field = getTemplate('photo-grid')!.fields.media1;
    if (field?.kind !== 'media') throw new Error('expected a media field');
    const top = gridCells('three', STORY_SIZE.width, STORY_SIZE.height)[0]!;
    expect(field.focus?.aspect?.byValue.three).toBeCloseTo(top.width / top.height);
    const slot4 = getTemplate('photo-grid')!.fields.media4;
    if (slot4?.kind !== 'media') throw new Error('expected a media field');
    expect(Object.keys(slot4.focus?.aspect?.byValue ?? {})).toEqual(['four']); // only the 2×2 layout has a 4th cell
  });
});

describe('Photo carousel', () => {
  it('moves from the first card centred to the last card centred', async () => {
    const { carouselCards } = await import('./carousel');
    const start = carouselCards('left', 4, 0, 1080, 1920);
    const end = carouselCards('left', 4, 1, 1080, 1920);
    const centreX = (r: { x: number; width: number }) => r.x + r.width / 2;
    expect(centreX(start[0]!)).toBeCloseTo(540);
    expect(centreX(end[3]!)).toBeCloseTo(540);
    expect(start[1]!.x).toBeGreaterThan(start[0]!.x); // strip runs left to right…
    expect(end[0]!.x).toBeLessThan(start[0]!.x); // …and moves left
    const up = carouselCards('up', 3, 1, 1080, 1920);
    expect(up[2]!.y + up[2]!.height / 2).toBeCloseTo(1920 * 0.55);
  });

  it('scrolls continuously: never standing still mid-scene', async () => {
    const { carouselProgress } = await import('./carousel');
    let previous = -1;
    for (let t = 0; t <= 6000; t += 250) {
      const p = carouselProgress(t, 6000);
      expect(p).toBeGreaterThan(previous);
      if (t > 500 && t < 5500) expect(p - previous).toBeGreaterThan(0.02);
      previous = p;
    }
    expect(carouselProgress(6000, 6000)).toBe(1);
  });

  it('uses filled slots in order and shows three placeholders when empty', () => {
    const empty = draw('carousel', { title: '' }, 0, 6000).texts();
    expect(empty).toContain('Photo 1');
    expect(empty).not.toContain('Photo 4');
    const ID = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
    const mock = createMockContext();
    const media = { frame: () => ({ source: {} as CanvasImageSource, width: 800, height: 600, kind: 'image' as const }) };
    getTemplate('carousel')!.draw(mock.ctx, { width: 1080, height: 1920, localMs: 0, durationMs: 6000, media }, { media2: ID, media5: ID, title: '' }, theme);
    expect(mock.calls.filter((c) => c.method === 'drawImage').length).toBeGreaterThan(0);
    expect(mock.texts().filter((t) => t.startsWith('Photo'))).toEqual([]);
  });
});

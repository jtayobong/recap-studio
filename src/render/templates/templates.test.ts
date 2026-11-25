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

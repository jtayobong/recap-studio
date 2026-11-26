import { describe, expect, it } from 'vitest';
import { NO_MEDIA } from '../media';
import { createMockContext } from '../testing/mockContext';
import { getTemplate } from './registry';

const theme = {
  palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
};

function draw(fields: Record<string, unknown>, localMs: number, width = 1080, height = 1920) {
  const mock = createMockContext();
  getTemplate('section')!.draw(mock.ctx, { width, height, localMs, durationMs: 2500, media: NO_MEDIA }, fields, theme);
  return mock;
}

describe('Section', () => {
  it('shows the label (in capitals), the title and the small line once settled', () => {
    const texts = draw({ label: 'Part 2', title: 'Summer', subtitle: 'June to August' }, 1300).texts();
    expect(texts).toEqual(['PART 2', 'Summer', 'June to August']);
  });

  it('builds up: nothing but the background and disc at the start, the small line last', () => {
    expect(draw({}, 0).texts()).toEqual([]);
    expect(draw({}, 600).texts()).not.toContain('June to August');
    expect(draw({}, 1300).texts()).toContain('June to August');
  });

  it('leaves out an empty label and small line', () => {
    expect(draw({ label: ' ', title: 'Autumn', subtitle: '' }, 1300).texts()).toEqual(['Autumn']);
  });

  it('keeps its text inside the frame in both shapes, even when long', () => {
    const long = { label: 'Chapter three', title: 'The long road home', subtitle: 'Six countries, one van and far too many snacks along the way' };
    for (const [w, h] of [[1080, 1920], [1920, 1080]] as const) {
      for (const call of draw(long, 1300, w, h).calls.filter((c) => c.method === 'fillText')) {
        expect(Number(call.args[2])).toBeLessThan(h);
        expect(Number(call.args[1])).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

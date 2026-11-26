import { describe, expect, it } from 'vitest';
import { NO_MEDIA } from '../media';
import { createMockContext } from '../testing/mockContext';
import { getTemplate } from './registry';
import { bulletItems, bulletStartMs, TEXT_MAX_BULLETS } from './text';

const theme = {
  palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
};

function draw(fields: Record<string, unknown>, localMs: number, width = 1080, height = 1920) {
  const mock = createMockContext();
  getTemplate('text')!.draw(mock.ctx, { width, height, localMs, durationMs: 6000, media: NO_MEDIA }, fields, theme);
  return mock;
}

describe('Text', () => {
  it('turns each non-empty line of the body into a bullet, at most eight', () => {
    expect(bulletItems(' One \n\n  Two\n')).toEqual(['One', 'Two']);
    expect(bulletItems(Array.from({ length: 12 }, (_, i) => `Item ${i}`).join('\n'))).toHaveLength(TEXT_MAX_BULLETS);
  });

  it('reveals bullets one after another, all started before the poster time', () => {
    const poster = getTemplate('text')!.posterMs;
    for (const count of [1, 3, 8]) {
      const starts = Array.from({ length: count }, (_, i) => bulletStartMs(i, count));
      starts.slice(1).forEach((s, i) => expect(s).toBeGreaterThan(starts[i]!));
      expect(starts.at(-1)! + 450).toBeLessThanOrEqual(poster);
    }
  });

  it('shows the title and every bullet once settled', () => {
    const texts = draw({ title: 'Lessons', layout: 'bullets', body: 'One\nTwo\nThree' }, 2500).texts();
    expect(texts).toEqual(['Lessons', 'One', 'Two', 'Three']);
  });

  it('builds up the bullets in order', () => {
    const at = (ms: number) => draw({ title: 'Lessons', body: 'One\nTwo\nThree' }, ms).texts();
    expect(at(0)).toEqual([]);
    expect(at(bulletStartMs(1, 3) - 10)).toEqual(['Lessons', 'One']);
  });

  it('draws a paragraph as wrapped text without markers', () => {
    const body = 'This year I moved cities, learned to cook and finally finished the novel I started in school.';
    const texts = draw({ title: 'In short', layout: 'paragraph', body }, 2500).texts();
    expect(texts[0]).toBe('In short');
    expect(texts.slice(1).join(' ')).toBe(body);
    expect(texts.length).toBeGreaterThan(2);
  });

  it('draws only the title when the body is empty', () => {
    expect(draw({ title: 'Hello', body: '  ' }, 2500).texts()).toEqual(['Hello']);
    expect(draw({ title: 'Hello', layout: 'paragraph', body: '' }, 2500).texts()).toEqual(['Hello']);
  });

  it('keeps long text inside the frame in both shapes', () => {
    const long = {
      title: 'Everything I learned in a very long and eventful year',
      body: Array.from({ length: 8 }, (_, i) => `Bullet number ${i + 1} with quite a lot of words so that it has to wrap`).join('\n'),
    };
    for (const layout of ['bullets', 'paragraph']) {
      for (const [w, h] of [[1080, 1920], [1920, 1080]] as const) {
        for (const call of draw({ ...long, layout }, 2500, w, h).calls.filter((c) => c.method === 'fillText')) {
          expect(Number(call.args[2])).toBeLessThan(h);
          expect(Number(call.args[1])).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

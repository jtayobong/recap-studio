import { describe, expect, it } from 'vitest';
import { NO_MEDIA } from '../media';
import { createMockContext } from '../testing/mockContext';
import { splitEllipsis } from './encore';
import { getTemplate } from './registry';

const theme = {
  palette: { background: '#123456', surface: '#111', primary: '#ff00aa', accent: '#0f0', text: '#eeeeee', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
  motion: 'lively' as const,
};

function draw(fields: Record<string, unknown>, localMs: number, size: [number, number] = [1080, 1920], durationMs = 5000) {
  const mock = createMockContext();
  getTemplate('encore')!.draw(mock.ctx, { width: size[0], height: size[1], localMs, durationMs, storyMs: localMs, media: NO_MEDIA }, fields, theme);
  return mock;
}

/** Text drawn with a visible (non-zero) alpha. */
const visibleTexts = (mock: ReturnType<typeof createMockContext>) =>
  mock.calls.filter((c) => c.method === 'fillText' && c.state.globalAlpha > 0.01).map((c) => String(c.args[0]));

describe('Encore', () => {
  it('splits a trailing ellipsis off the first line so the dots can appear one by one', () => {
    expect(splitEllipsis('One more thing…')).toEqual({ base: 'One more thing', dots: true });
    expect(splitEllipsis(' One more thing... ')).toEqual({ base: 'One more thing', dots: true });
    expect(splitEllipsis('Wait for it')).toEqual({ base: 'Wait for it', dots: false });
  });

  it('fades the first line in, then adds the dots one at a time', () => {
    expect(visibleTexts(draw({}, 0))).toEqual([]);
    expect(visibleTexts(draw({}, 1000))).toEqual(['One more thing']); // dots start at 22 %
    expect(visibleTexts(draw({}, 1250))).toEqual(['One more thing', '.']);
    expect(visibleTexts(draw({}, 2000))).toEqual(['One more thing', '.', '.', '.']);
  });

  it('then swaps the first line for the reveal', () => {
    const end = visibleTexts(draw({ reveal: 'We got a dog', detail: 'Meet Mochi' }, 4600)).join(' ');
    expect(end).toBe('We got a dog Meet Mochi'); // the first line is gone
  });

  it('without a reveal, the first line holds to the end', () => {
    expect(visibleTexts(draw({ reveal: '' }, 4900))).toEqual(['One more thing', '.', '.', '.']);
  });

  it('keeps its rhythm in a shorter scene', () => {
    expect(visibleTexts(draw({}, 2400, [1080, 1920], 2500)).join(' ')).toBe('See you in 2027');
  });

  it('black stage: black background, white text and no background motion; story colours: the palette and motion', () => {
    const stage = draw({}, 4600);
    expect(stage.calls[0]).toMatchObject({ method: 'fillRect' });
    expect(stage.calls.find((c) => c.method === 'fillText')?.state.fillStyle).toBe('#ffffff');
    expect(stage.calls.some((c) => c.method === 'arc')).toBe(false); // no drifting shapes

    const story = draw({ look: 'story' }, 4600);
    expect(story.calls.find((c) => c.method === 'fillText')?.state.fillStyle).toBe('#ff00aa'); // reveal in the primary colour
    expect(story.calls.some((c) => c.method === 'arc')).toBe(true);
  });

  it('centres everything in both shapes', () => {
    for (const [w, h] of [[1080, 1920], [1920, 1080]] as const) {
      const reveal = draw({}, 4600, [w, h]).calls.find((c) => c.method === 'fillText');
      expect(reveal?.args[1]).toBe(w / 2);
      expect(Number(reveal?.args[2])).toBeGreaterThan(h * 0.4);
      expect(Number(reveal?.args[2])).toBeLessThan(h * 0.65);
    }
  });
});

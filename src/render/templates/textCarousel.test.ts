import { describe, expect, it } from 'vitest';
import { NO_MEDIA } from '../media';
import { createMockContext } from '../testing/mockContext';
import { isFieldVisible, resolveFields } from '../fields';
import { getTemplate } from './registry';
import { filledCards, TEXT_CAROUSEL_ENTER_MS, textCarouselCards, textCarouselPosition } from './textCarousel';

const theme = {
  palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
};

function draw(fields: Record<string, unknown>, localMs: number, durationMs = 6000, width = 1080, height = 1920) {
  const mock = createMockContext();
  getTemplate('text-carousel')!.draw(mock.ctx, { width, height, localMs, durationMs, media: NO_MEDIA }, fields, theme);
  return mock;
}

describe('textCarouselPosition (step and pause)', () => {
  it('slides in, then holds each card for most of its beat and moves at the end of it', () => {
    // 3 cards over 6 s: beats of 2 s, moves of 650 ms at the end of each beat.
    expect(textCarouselPosition(0, 6000, 3)).toBeCloseTo(-0.5);
    expect(textCarouselPosition(TEXT_CAROUSEL_ENTER_MS, 6000, 3)).toBe(0);
    expect(textCarouselPosition(1300, 6000, 3)).toBe(0); // still holding card 1
    expect(textCarouselPosition(1700, 6000, 3)).toBeGreaterThan(0); // moving
    expect(textCarouselPosition(1700, 6000, 3)).toBeLessThan(1);
    expect(textCarouselPosition(2000, 6000, 3)).toBe(1);
    expect(textCarouselPosition(3000, 6000, 3)).toBe(1); // holding card 2
    expect(textCarouselPosition(5999, 6000, 3)).toBe(2); // the last card holds to the end
    expect(textCarouselPosition(9000, 6000, 3)).toBe(2);
  });

  it('never moves backwards', () => {
    let last = -Infinity;
    for (let t = 0; t <= 7000; t += 25) {
      const p = textCarouselPosition(t, 7000, 5);
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      last = p;
    }
  });

  it('keeps short beats readable: the move takes at most a third of a beat', () => {
    // 6 cards in 3 s: 500 ms beats, so moves take 175 ms and each card holds for 325 ms
    // (card 2 holds from 500 to 825 ms, then moves on to card 3).
    expect(textCarouselPosition(800, 3000, 6)).toBe(1);
    expect(textCarouselPosition(900, 3000, 6)).toBeGreaterThan(1);
  });

  it('one card: just the slide-in', () => {
    expect(textCarouselPosition(0, 4000, 1)).toBeCloseTo(-0.5);
    expect(textCarouselPosition(3000, 4000, 1)).toBe(0);
  });
});

describe('textCarouselCards', () => {
  it('centres the current card and lines the others up along the direction', () => {
    const sideways = textCarouselCards('left', 3, 1, 1080, 1920);
    expect(sideways[1]!.x + sideways[1]!.width / 2).toBeCloseTo(540);
    expect(sideways[0]!.x).toBeLessThan(sideways[1]!.x);
    expect(new Set(sideways.map((c) => c.y)).size).toBe(1);
    const upwards = textCarouselCards('up', 3, 0, 1920, 1080);
    expect(upwards[0]!.x + upwards[0]!.width / 2).toBeCloseTo(960);
    expect(upwards[1]!.y).toBeGreaterThan(upwards[0]!.y);
    expect(new Set(upwards.map((c) => c.x)).size).toBe(1);
  });
});

describe('Text carousel', () => {
  it('counts a card once it has a headline, in order', () => {
    expect(filledCards({ headline1: 'A', detail1: 'a', headline2: ' ', detail2: 'ignored', headline3: 'C' })).toEqual([
      { headline: 'A', detail: 'a' },
      { headline: 'C', detail: '' },
    ]);
  });

  it('draws the title and the centred card (headline and small line) once settled', () => {
    const fields = { title: 'My year', headline1: 'Lisbon', detail1: '12 days in May', headline2: 'Kyoto', detail2: '', headline3: '' };
    const texts = draw(fields, 900).texts();
    expect(texts).toEqual(expect.arrayContaining(['My year', 'Lisbon', '12 days in May']));
  });

  it('shows the next card after its beat, and only cards on screen', () => {
    const fields = { title: '', headline1: 'One', headline2: 'Two', headline3: 'Three', headline4: 'Four', headline5: 'Five', headline6: '' };
    const early = draw(fields, 900, 10_000).texts();
    expect(early).toContain('One');
    expect(early).not.toContain('Four');
    const late = draw(fields, 9500, 10_000).texts();
    expect(late).toContain('Five');
    expect(late).not.toContain('One');
  });

  it('with every card empty, shows sample cards', () => {
    const texts = draw({ title: '', headline1: '', headline2: '', headline3: '' }, 900).texts().join(' ');
    expect(texts).toContain('Highlight');
  });

  it('reveals one more card field as the previous card gets a headline', () => {
    const defs = getTemplate('text-carousel')!.fields;
    const visibleCards = (raw: Record<string, unknown>) => {
      const values = resolveFields(defs, raw);
      return Object.entries(defs).filter(([k, d]) => /^headline\d$/.test(k) && isFieldVisible(d, values)).length;
    };
    expect(visibleCards({})).toBe(4); // three sample cards filled by default, plus the next one
    expect(visibleCards({ headline1: 'A', headline2: '', headline3: '' })).toBe(2);
    expect(visibleCards({ headline1: '', headline2: '', headline3: '' })).toBe(1);
  });

  it('keeps the title and the centred card inside the frame in landscape, both directions', () => {
    for (const direction of ['left', 'up']) {
      const { calls } = draw({ direction, headline1: 'Lisbon', detail1: '12 days in May' }, 900, 6000, 1920, 1080);
      const own = calls.filter((c) => c.method === 'fillText' && ['Highlights of the year', 'Lisbon', '12 days in May'].includes(String(c.args[0])));
      expect(own).toHaveLength(3);
      for (const call of own) {
        expect(Number(call.args[1])).toBeGreaterThan(0);
        expect(Number(call.args[2])).toBeLessThan(1080);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { slotCropAspect, type MediaField } from '../fields';
import { createMockContext } from '../testing/mockContext';
import { framedCard } from './photo';
import { getTemplate } from './registry';

const theme = {
  palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
};
const ID = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
const media = { frame: () => ({ source: {} as CanvasImageSource, width: 1600, height: 1200, kind: 'image' as const }) };

function draw(fields: Record<string, unknown>, [w, h]: [number, number] = [1080, 1920], localMs = 2000) {
  const mock = createMockContext();
  getTemplate('photo')!.draw(mock.ctx, { width: w, height: h, localMs, durationMs: 4000, media }, { media: ID, ...fields }, theme);
  return mock;
}

describe('Photo / Video layout (M12.6)', () => {
  it('framed: the card leaves padding on every side, with room for the caption below (portrait) or beside it (landscape)', () => {
    const portrait = framedCard(1080, 1920, true);
    expect(portrait.x).toBeGreaterThan(0);
    expect(portrait.y).toBeGreaterThan(0);
    expect(portrait.x + portrait.width).toBeLessThan(1080);
    expect(1920 - (portrait.y + portrait.height)).toBeGreaterThan(1920 * 0.15); // caption room below
    const landscape = framedCard(1920, 1080, true);
    expect(1920 - (landscape.x + landscape.width)).toBeGreaterThan(1920 * 0.3); // caption column
    // Without a caption the card is centred.
    const alone = framedCard(1080, 1920, false);
    expect(alone.y + alone.height / 2).toBeCloseTo(960);
    const wideAlone = framedCard(1920, 1080, false);
    expect(wideAlone.x + wideAlone.width / 2).toBeCloseTo(960);
  });

  it('framed draws the media inside the card; full screen across the whole frame', () => {
    const dest = (fields: Record<string, unknown>) => draw(fields).calls.find((c) => c.method === 'drawImage')!.args.slice(5, 9) as number[];
    const card = framedCard(1080, 1920, true);
    expect(dest({ layout: 'framed' })).toEqual([card.x, card.y, card.width, card.height]);
    expect(dest({ layout: 'full' })).toEqual([0, 0, 1080, 1920]);
  });

  it('framed puts the caption under the card in portrait and beside it in landscape, with no band behind it', () => {
    const caption = (size: [number, number]) => draw({ layout: 'framed', caption: 'Sunset' }, size).calls.find((c) => c.method === 'fillText')!;
    const portraitCard = framedCard(1080, 1920, true);
    expect(Number(caption([1080, 1920]).args[2])).toBeGreaterThan(portraitCard.y + portraitCard.height);
    const landscapeCard = framedCard(1920, 1080, true);
    expect(Number(caption([1920, 1080]).args[1])).toBeGreaterThan(landscapeCard.x + landscapeCard.width);
  });

  it('the focus picker shows the card shape when framed, the frame shape when full screen', () => {
    const field = getTemplate('photo')!.fields.media as MediaField;
    const card = framedCard(1080, 1920, true);
    expect(slotCropAspect(field.focus!, { layout: 'framed' }, { width: 1080, height: 1920 })).toBeCloseTo(card.width / card.height);
    expect(slotCropAspect(field.focus!, { layout: 'full' }, { width: 1080, height: 1920 })).toBeCloseTo(1080 / 1920);
  });
});

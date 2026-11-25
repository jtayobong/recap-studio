import { describe, expect, it } from 'vitest';
import { containRect, coverRect, drawMedia, type MediaFrame } from './media';
import { createMockContext } from './testing/mockContext';

const box = { x: 0, y: 0, width: 1080, height: 1920 };
const image = (width: number, height: number): MediaFrame => ({ source: {} as CanvasImageSource, width, height, kind: 'image' });

describe('coverRect', () => {
  it('crops a landscape source to a portrait box around the center', () => {
    const r = coverRect(4000, 3000, box);
    expect(r.height).toBe(3000);
    expect(r.width).toBeCloseTo(3000 * (1080 / 1920));
    expect(r.x).toBeCloseTo((4000 - r.width) / 2);
    expect(r.y).toBe(0);
  });

  it('moves the crop toward the focus point but stays inside the source', () => {
    expect(coverRect(4000, 3000, box, 0, 0.5).x).toBe(0);
    const right = coverRect(4000, 3000, box, 1, 0.5);
    expect(right.x + right.width).toBeCloseTo(4000);
    expect(coverRect(4000, 3000, box, 0.6, 0.5).x).toBeCloseTo(4000 * 0.6 - right.width / 2);
  });

  it('zoom crops further, around the focus point', () => {
    expect(coverRect(1080, 1920, box, 0.5, 0.5, 2)).toEqual({ x: 270, y: 480, width: 540, height: 960 });
  });

  it('never returns a rect larger than the source', () => {
    const r = coverRect(100, 100, box);
    expect(r.width).toBeLessThanOrEqual(100);
    expect(r.height).toBeLessThanOrEqual(100);
  });
});

describe('containRect', () => {
  it('fits and centers the whole source', () => {
    expect(containRect(1920, 1080, box)).toEqual({ x: 0, y: (1920 - 607.5) / 2, width: 1080, height: 607.5 });
  });
});

describe('drawMedia', () => {
  it('cover draws once, clipped to the box', () => {
    const { ctx, calls } = createMockContext();
    drawMedia(ctx, image(4000, 3000), box, { fit: 'cover' });
    const draws = calls.filter((c) => c.method === 'drawImage');
    expect(draws).toHaveLength(1);
    expect(draws[0]?.args.slice(5)).toEqual([0, 0, 1080, 1920]);
    expect(calls.some((c) => c.method === 'clip')).toBe(true);
  });

  it('contain draws a tinted backdrop and then the whole picture', () => {
    const { ctx, calls } = createMockContext();
    drawMedia(ctx, image(1920, 1080), box, { fit: 'contain', backdropTint: '#000', backdropTintAlpha: 0.5 });
    const methods = calls.map((c) => c.method).filter((m) => m === 'drawImage' || m === 'fillRect');
    expect(methods).toEqual(['drawImage', 'fillRect', 'drawImage']);
    expect(calls.find((c) => c.method === 'fillRect')?.state.globalAlpha).toBe(0.5);
    expect(calls.filter((c) => c.method === 'drawImage')[1]?.args.slice(1)).toEqual([0, 0, 1920, 1080, 0, 656.25, 1080, 607.5]);
  });

  it('balances save/restore and ignores empty sources', () => {
    const { ctx, calls } = createMockContext();
    drawMedia(ctx, image(0, 0), box, { fit: 'cover' });
    drawMedia(ctx, image(10, 10), box, { fit: 'contain' });
    expect(calls.filter((c) => c.method === 'save').length).toBe(calls.filter((c) => c.method === 'restore').length);
  });
});

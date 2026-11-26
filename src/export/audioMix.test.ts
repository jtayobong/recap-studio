import { describe, expect, it } from 'vitest';
import { clipEdgeGain, CLIP_EDGE_FADE_MS, mixAudio, Resampler, type MixPlan, type PcmReader, type Stereo } from './audioMix';

/** A reader returning a constant value on both channels, counting what was read. */
function constantReader(value: number): PcmReader & { consumed: number } {
  const reader = {
    consumed: 0,
    async read(frames: number): Promise<Stereo> {
      reader.consumed += frames;
      return [new Float32Array(frames).fill(value), new Float32Array(frames).fill(value)];
    },
  };
  return reader;
}

async function collect(plan: MixPlan, block = 100) {
  const left: number[] = [];
  const starts: number[] = [];
  for await (const chunk of mixAudio(plan, block)) {
    starts.push(chunk.startS);
    left.push(...chunk.planes[0]);
  }
  return { left, starts };
}

describe('mixAudio', () => {
  it('lasts until the last source ends and applies the music gain per frame', async () => {
    const music = constantReader(1);
    const { left, starts } = await collect({ rate: 1000, endMs: 250, music: { reader: music, endMs: 250, gain: (t) => (t < 100 ? 0.5 : 1) }, clips: [] });
    expect(left).toHaveLength(250);
    expect(starts).toEqual([0, 0.1, 0.2]);
    expect(left[50]).toBe(0.5);
    expect(left[150]).toBe(1);
    expect(music.consumed).toBe(250);
  });

  it('places clips at their story time, reading them from their own start, with edge fades', async () => {
    const clip = constantReader(0.8);
    const { left } = await collect({ rate: 1000, endMs: 400, clips: [{ reader: clip, startMs: 100, endMs: 300, volume: 1 }] });
    expect(left[50]).toBe(0); // before the clip
    expect(left[100]).toBe(0); // the fade starts at 0
    expect(left[110]).toBeCloseTo((0.8 * 10) / CLIP_EDGE_FADE_MS); // 10 ms into the fade
    expect(left[200]).toBeCloseTo(0.8);
    expect(left[350]).toBe(0); // after it
    expect(clip.consumed).toBe(200);
  });

  it('sums music and clips', async () => {
    const { left } = await collect({
      rate: 1000,
      endMs: 200,
      music: { reader: constantReader(0.5), endMs: 200, gain: () => 0.3 },
      clips: [{ reader: constantReader(0.5), startMs: 0, endMs: 200, volume: 1 }],
    });
    expect(left[100]).toBeCloseTo(0.15 + 0.5);
  });

  it('plays each clip at its own volume (M10)', async () => {
    const { left } = await collect({ rate: 1000, endMs: 200, clips: [{ reader: constantReader(0.8), startMs: 0, endMs: 200, volume: 0.25 }] });
    expect(left[100]).toBeCloseTo(0.2);
  });

  it('clipEdgeGain is 0 outside, 1 inside, ramped at both edges', () => {
    expect(clipEdgeGain(-1, 0, 1000)).toBe(0);
    expect(clipEdgeGain(0, 0, 1000)).toBe(0);
    expect(clipEdgeGain(500, 0, 1000)).toBe(1);
    expect(clipEdgeGain(1000 - CLIP_EDGE_FADE_MS / 2, 0, 1000)).toBeCloseTo(0.5);
    expect(clipEdgeGain(1000, 0, 1000)).toBe(0);
  });
});

describe('Resampler', () => {
  it('converts the rate (22.05 kHz → 48 kHz) and keeps the signal shape', () => {
    const r = new Resampler(48_000);
    const input = new Float32Array(22_050).map((_, i) => i / 22_050); // a 1 s ramp 0→1
    r.push([input], 22_050);
    r.finish();
    const out = r.pull(48_000)!;
    expect(out[0][24_000]).toBeCloseTo(0.5, 2); // halfway through, halfway up
    expect(out[1][24_000]).toBe(out[0][24_000]); // mono is duplicated to both channels
  });

  it('asks for more input until it has enough, then delivers exact frame counts', () => {
    const r = new Resampler(1000);
    r.push([new Float32Array(10).fill(1), new Float32Array(10).fill(2)], 1000);
    expect(r.pull(20)).toBeNull();
    expect(r.pull(5)?.[1][0]).toBe(2);
    r.push([new Float32Array(30).fill(1), new Float32Array(30).fill(2)], 1000);
    expect(r.pull(20)?.[0]).toHaveLength(20);
  });

  it('pads with silence once finished', () => {
    const r = new Resampler(1000);
    r.push([new Float32Array(3).fill(1)], 1000);
    r.finish();
    expect(Array.from(r.pull(6)![0])).toEqual([1, 1, 1, 0, 0, 0]);
  });
});

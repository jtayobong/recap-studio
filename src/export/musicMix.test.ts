import { describe, expect, it } from 'vitest';
import { defaultAudioTrack, MUSIC_FADE_OUT_MS } from '../domain/project';
import { mixMusicBlock, type PcmBlock } from './musicMix';

const RATE = 1000; // 1 frame per ms keeps the arithmetic readable

/** A block of constant 1.0 samples starting at `startS` (song time), `frames` long, 2 channels. */
const ones = (startS: number, frames: number): PcmBlock => ({
  planes: [new Float32Array(frames).fill(1), new Float32Array(frames).fill(1)],
  sampleRate: RATE,
  startS,
});

const track = (overrides = {}) => ({ ...defaultAudioTrack('song'), fadeOut: false, ...overrides });

describe('mixMusicBlock', () => {
  it('drops song audio before the start point and moves the rest to story time', () => {
    const out = mixMusicBlock(ones(44.5, 1000), { track: track({ offsetMs: 45_000 }), storyMs: 30_000, songMs: 180_000 })!;
    expect(out.startS).toBeCloseTo(0);
    expect(out.planes[0]).toHaveLength(500); // the half before 45 s is dropped
    expect(out.planes[1]).toHaveLength(500);
  });

  it('drops audio after the story ends', () => {
    const out = mixMusicBlock(ones(29.5, 1000), { track: track(), storyMs: 30_000, songMs: 180_000 })!;
    expect(out.startS).toBeCloseTo(29.5);
    expect(out.planes[0]).toHaveLength(500);
  });

  it('returns null for blocks entirely outside the music', () => {
    const context = { track: track({ offsetMs: 10_000 }), storyMs: 30_000, songMs: 180_000 };
    expect(mixMusicBlock(ones(5, 1000), context)).toBeNull(); // before the start point
    expect(mixMusicBlock(ones(41, 1000), context)).toBeNull(); // after the story
    expect(mixMusicBlock(ones(0, 0), context)).toBeNull();
    expect(mixMusicBlock(ones(0, 100), { ...context, track: track({ offsetMs: 200_000 }) })).toBeNull();
  });

  it('applies volume, and the same fade-out as the preview', () => {
    const out = mixMusicBlock(ones(28, 2000), { track: track({ volume: 0.5, fadeOut: true }), storyMs: 30_000, songMs: 180_000 })!;
    const plane = out.planes[0]!;
    expect(plane[0]).toBeCloseTo(0.5); // 28.0 s: fade out (last 1.5 s) not started yet
    expect(plane[2000 - MUSIC_FADE_OUT_MS / 2]).toBeCloseTo(0.25, 2); // halfway through the fade
    expect(plane[1999]).toBeLessThan(0.01); // nearly silent at the end
    expect(out.planes[1]![1000]).toBe(plane[1000]); // both channels get the same gain
  });

  it('does not modify the input block', () => {
    const block = ones(0, 100);
    mixMusicBlock(block, { track: track({ volume: 0.2 }), storyMs: 30_000, songMs: 180_000 });
    expect(block.planes[0]![50]).toBe(1);
  });
});

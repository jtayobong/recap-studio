import { describe, expect, it } from 'vitest';
import { duckGain, DUCK_LEVEL, DUCK_RAMP_MS, musicEndMs, musicGain, songTimeMs } from './music';
import { defaultAudioTrack, MUSIC_FADE_IN_MS, MUSIC_FADE_OUT_MS } from './project';

const track = (overrides = {}) => ({ ...defaultAudioTrack('song'), ...overrides });

describe('music timing', () => {
  it('maps story time to song time from the start point', () => {
    expect(songTimeMs(track({ offsetMs: 45_000 }), 2_000)).toBe(47_000);
  });

  it('stops at whichever ends first: story or song', () => {
    expect(musicEndMs(track(), 30_000, 180_000)).toBe(30_000); // story ends first
    expect(musicEndMs(track({ offsetMs: 170_000 }), 30_000, 180_000)).toBe(10_000); // song ends first
    expect(musicEndMs(track({ offsetMs: 200_000 }), 30_000, 180_000)).toBe(0); // start past the end
  });
});

describe('musicGain', () => {
  it('is the volume in the middle, and silent outside the music', () => {
    const t = track({ volume: 0.6, fadeOut: false });
    expect(musicGain(t, 5_000, 30_000, 180_000)).toBe(0.6);
    expect(musicGain(t, -1, 30_000, 180_000)).toBe(0);
    expect(musicGain(t, 30_000, 30_000, 180_000)).toBe(0);
  });

  it('fades in over the first second when enabled', () => {
    const t = track({ fadeIn: true, fadeOut: false });
    expect(musicGain(t, 0, 30_000, 180_000)).toBe(0);
    expect(musicGain(t, MUSIC_FADE_IN_MS / 2, 30_000, 180_000)).toBeCloseTo(0.5);
    expect(musicGain(t, MUSIC_FADE_IN_MS, 30_000, 180_000)).toBe(1);
    expect(musicGain(track({ fadeOut: false }), 0, 30_000, 180_000)).toBe(1);
  });

  it('fades out before the story ends, or before the song ends if that is first', () => {
    const t = track(); // fade out on by default
    expect(musicGain(t, 30_000 - MUSIC_FADE_OUT_MS, 30_000, 180_000)).toBe(1);
    expect(musicGain(t, 30_000 - MUSIC_FADE_OUT_MS / 2, 30_000, 180_000)).toBeCloseTo(0.5);
    const early = track({ offsetMs: 170_000 }); // song ends 10 s into the story
    expect(musicGain(early, 10_000 - MUSIC_FADE_OUT_MS / 2, 30_000, 180_000)).toBeCloseTo(0.5);
    expect(musicGain(early, 12_000, 30_000, 180_000)).toBe(0);
  });

  it('combines volume with both fades', () => {
    const t = track({ volume: 0.5, fadeIn: true });
    expect(musicGain(t, MUSIC_FADE_IN_MS / 2, 30_000, 180_000)).toBeCloseTo(0.25);
  });
});

describe('duckGain', () => {
  const segments = [{ assetId: 'c', startMs: 5000, endMs: 8000 }];

  it('ducks the music during clip sound, ramping before and after', () => {
    expect(duckGain(1000, segments)).toBe(1);
    expect(duckGain(5000 - DUCK_RAMP_MS / 2, segments)).toBeCloseTo(1 - (1 - DUCK_LEVEL) / 2);
    expect(duckGain(6000, segments)).toBeCloseTo(DUCK_LEVEL);
    expect(duckGain(8000 + DUCK_RAMP_MS / 2, segments)).toBeCloseTo(1 - (1 - DUCK_LEVEL) / 2);
    expect(duckGain(9000, segments)).toBe(1);
    expect(duckGain(6000, [])).toBe(1);
  });

  it('overlapping segments duck once, not twice', () => {
    expect(duckGain(6000, [...segments, { assetId: 'b', startMs: 5500, endMs: 7000 }])).toBeCloseTo(DUCK_LEVEL);
  });
});

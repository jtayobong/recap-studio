import { beforeEach, describe, expect, it } from 'vitest';
import { advance, usePlaybackStore } from './playbackStore';

describe('advance', () => {
  it('moves time forward while inside the story', () => {
    expect(advance(1000, 16, 5000, false)).toEqual({ timeMs: 1016, playing: true });
  });

  it('stops at the end when not looping', () => {
    expect(advance(4990, 50, 5000, false)).toEqual({ timeMs: 5000, playing: false });
  });

  it('wraps around when looping', () => {
    expect(advance(4990, 50, 5000, true)).toEqual({ timeMs: 40, playing: true });
  });

  it('stops immediately for an empty story', () => {
    expect(advance(0, 16, 0, true)).toEqual({ timeMs: 0, playing: false });
  });
});

describe('playback store', () => {
  beforeEach(() => usePlaybackStore.getState().reset());

  it('seeks, never below zero', () => {
    usePlaybackStore.getState().seek(1200);
    expect(usePlaybackStore.getState().timeMs).toBe(1200);
    usePlaybackStore.getState().seek(-5);
    expect(usePlaybackStore.getState().timeMs).toBe(0);
  });

  it('reset stops playback and rewinds', () => {
    usePlaybackStore.getState().seek(900);
    usePlaybackStore.getState().play();
    usePlaybackStore.getState().reset();
    expect(usePlaybackStore.getState()).toMatchObject({ timeMs: 0, playing: false });
  });
});

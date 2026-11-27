import { describe, expect, it, vi } from 'vitest';
import { defaultAudioTrack } from '../domain/project';
import { syncMusic, type AudioLike, type MusicSyncState } from './musicSync';

function fakeAudio(): AudioLike & { plays: number; seeks: number[] } {
  let paused = true;
  let currentTime = 0;
  const audio = {
    plays: 0,
    seeks: [] as number[],
    volume: 1,
    muted: false,
    get paused() {
      return paused;
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      audio.seeks.push(value);
    },
    play: vi.fn(async () => {
      paused = false;
      audio.plays += 1;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    /** Test helper: the element's own clock moving on while playing. */
    advance(seconds: number) {
      currentTime += seconds;
    },
  };
  return audio;
}

const state = (overrides: Partial<MusicSyncState> = {}): MusicSyncState => ({
  track: { ...defaultAudioTrack('song'), offsetMs: 45_000, fadeOut: false },
  songMs: 180_000,
  storyMs: 30_000,
  timeMs: 2_000,
  playing: true,
  muted: false,
  ...overrides,
});

describe('syncMusic', () => {
  it('starts at the right place in the song when playback starts', () => {
    const audio = fakeAudio();
    syncMusic(audio, state());
    expect(audio.seeks).toEqual([47]);
    expect(audio.paused).toBe(false);
    expect(audio.volume).toBe(1);
  });

  it('leaves a playing element alone unless it drifts', () => {
    const audio = fakeAudio();
    syncMusic(audio, state({ timeMs: 2_000 }));
    (audio as unknown as { advance(s: number): void }).advance(0.1);
    syncMusic(audio, state({ timeMs: 2_150 })); // 0.05 s apart: fine
    expect(audio.seeks).toEqual([47]);
    syncMusic(audio, state({ timeMs: 5_000 })); // the user scrubbed while playing
    expect(audio.seeks).toEqual([47, 50]);
    expect(audio.plays).toBe(1);
  });

  it('pauses when playback pauses, before the music, and after it ends', () => {
    const audio = fakeAudio();
    syncMusic(audio, state());
    syncMusic(audio, state({ playing: false }));
    expect(audio.paused).toBe(true);

    syncMusic(audio, state({ track: { ...defaultAudioTrack('song'), offsetMs: 175_000 }, timeMs: 6_000 })); // song ended at 5 s
    expect(audio.paused).toBe(true);
    syncMusic(audio, state({ timeMs: 30_000 })); // story over
    expect(audio.paused).toBe(true);
  });

  it('stays silent without a track or while the song is loading', () => {
    const audio = fakeAudio();
    syncMusic(audio, state({ track: undefined }));
    syncMusic(audio, state({ songMs: undefined }));
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('applies volume and fades every frame', () => {
    const audio = fakeAudio();
    syncMusic(audio, state({ track: { ...defaultAudioTrack('song'), volume: 0.5, fadeIn: true, fadeOut: false }, timeMs: 500 }));
    expect(audio.volume).toBeCloseTo(0.25);
    syncMusic(audio, state({ track: { ...defaultAudioTrack('song'), volume: 0.5, fadeIn: true, fadeOut: false }, timeMs: 1_500 }));
    expect(audio.volume).toBeCloseTo(0.5);
  });

  it('mute silences without losing sync', () => {
    const audio = fakeAudio();
    syncMusic(audio, state({ muted: true }));
    expect(audio.muted).toBe(true);
    expect(audio.paused).toBe(false); // keeps playing in time, just silent
    syncMusic(audio, state({ muted: false, timeMs: 2_100 }));
    expect(audio.muted).toBe(false);
  });
});

describe('syncMusic ducking', () => {
  it('multiplies the volume by the duck factor', () => {
    const audio = fakeAudio();
    syncMusic(audio, state({ duck: 0.3 }));
    expect(audio.volume).toBeCloseTo(0.3);
  });
});

describe('syncMusic with a later start scene (M12.4)', () => {
  it('stays silent before the music starts, then starts at the song start point', () => {
    const audio = fakeAudio();
    syncMusic(audio, state({ startMs: 5_000, timeMs: 4_000 }));
    expect(audio.paused).toBe(true);
    syncMusic(audio, state({ startMs: 5_000, timeMs: 6_000 }));
    expect(audio.paused).toBe(false);
    expect(audio.seeks).toEqual([46]); // 45 s into the song + 1 s since the music started
  });
});

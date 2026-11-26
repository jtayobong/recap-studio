import { describe, expect, it } from 'vitest';
import { videoCodecString } from './codecString';
import { bitrateFor, EXPORT_FPS, QUALITY_PRESETS, type QualityPresetId } from './presets';

const SHAPES = [
  { width: 1080, height: 1920 },
  { width: 1920, height: 1080 },
];
const PRESETS = Object.keys(QUALITY_PRESETS) as QualityPresetId[];

describe('videoCodecString', () => {
  it('matches the 30 fps strings Mediabunny builds (and the capability probe uses)', () => {
    for (const size of SHAPES) {
      for (const preset of PRESETS) {
        const bitrate = bitrateFor(preset, { ...size, fps: 30 });
        expect(videoCodecString('avc', size.width, size.height, 30, bitrate)).toBe('avc1.640028'); // level 4.0
        expect(videoCodecString('vp9', size.width, size.height, 30, bitrate)).toBe('vp09.00.40.08');
      }
    }
  });

  it('picks a level that allows 1080p at 60 fps, for every preset and shape', () => {
    for (const size of SHAPES) {
      for (const preset of PRESETS) {
        const bitrate = bitrateFor(preset, { ...size, fps: 60 });
        expect(videoCodecString('avc', size.width, size.height, 60, bitrate)).toBe('avc1.64002a'); // level 4.2
        expect(videoCodecString('vp9', size.width, size.height, 60, bitrate)).toBe('vp09.00.41.08');
      }
    }
  });

  it('raises the level for bitrate and size too', () => {
    expect(videoCodecString('avc', 1080, 1920, 30, 25_000_000)).toBe('avc1.640029'); // 4.1: over 4.0's 20 Mbps
    expect(videoCodecString('avc', 3840, 2160, 30, 40_000_000)).toBe('avc1.640033'); // 5.1
    expect(videoCodecString('avc', 640, 360, 30, 1_000_000)).toBe('avc1.64001e'); // 3.0
    expect(videoCodecString('vp9', 1080, 1920, 30, 20_000_000)).toBe('vp09.00.41.08'); // over 4.0's 18 Mbps
  });

  it('offers 30 and 60 fps', () => {
    expect([...EXPORT_FPS]).toEqual([30, 60]);
  });
});

describe('bitrates at 60 fps', () => {
  it('scales every preset by √2 (Standard ~11.3, High ~17, Smaller ~7 Mbps)', () => {
    for (const size of SHAPES) {
      expect(bitrateFor('standard', { ...size, fps: 60 })).toBe(11_314_000);
      expect(bitrateFor('high', { ...size, fps: 60 })).toBe(16_971_000);
      expect(bitrateFor('small', { ...size, fps: 60 })).toBe(7_071_000);
    }
  });
});

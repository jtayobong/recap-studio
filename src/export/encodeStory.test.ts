import { describe, expect, it } from 'vitest';
import { frameCount } from './encodeStory';

describe('frameCount', () => {
  it('counts whole and partial frames', () => {
    expect(frameCount(8500, 30)).toBe(255);
    expect(frameCount(1000, 30)).toBe(30);
    expect(frameCount(1010, 30)).toBe(31); // a partial last frame still needs a frame
    expect(frameCount(1000 / 3, 30)).toBe(10); // float noise doesn't add a frame
    expect(frameCount(0, 30)).toBe(0);
  });

  it('doubles at 60 fps', () => {
    expect(frameCount(8500, 60)).toBe(510);
    expect(frameCount(1000 / 3, 60)).toBe(20);
    expect(frameCount(1010, 60)).toBe(61);
  });
});

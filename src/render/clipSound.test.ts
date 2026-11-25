import { describe, expect, it } from 'vitest';
import type { Scene } from '../domain/project';
import { audibleAt, soundSegments } from './clipSound';
import { createScene } from './templates/registry';

const scene = (templateId: string, durationMs: number, fields: Record<string, unknown>): Scene => {
  const base = createScene(templateId);
  return { ...base, durationMs, fields: { ...base.fields, ...fields } };
};

const assets: Record<string, { kind: 'image' | 'video' | 'audio'; durationMs?: number }> = {
  clipA: { kind: 'video', durationMs: 10_000 },
  clipB: { kind: 'video', durationMs: 1500 },
  photo: { kind: 'image' },
};
const lookup = (id: string) => assets[id];

describe('soundSegments', () => {
  it('only scenes with "Keep clip sound", only video clips, for the scene (or clip) length', () => {
    const scenes = [
      scene('title', 3000, {}),
      scene('photo', 4000, { media: 'clipA', clipSound: true }), // 3–7 s
      scene('photo', 4000, { media: 'clipA', clipSound: false }), // silent
      scene('photo', 4000, { media: 'photo', clipSound: true }), // a photo: no sound
      scene('photo', 4000, { media: 'clipB', clipSound: true }), // 15–16.5 s: the clip ends first
    ];
    expect(soundSegments(scenes, lookup)).toEqual([
      { assetId: 'clipA', startMs: 3000, endMs: 7000 },
      { assetId: 'clipB', startMs: 15_000, endMs: 16_500 },
    ]);
  });

  it('every clip of a grid or carousel scene, each once; unknown assets are skipped', () => {
    const scenes = [scene('carousel', 6000, { clipSound: true, media1: 'clipA', media2: 'photo', media3: 'clipB', media4: 'clipA', media5: 'gone' })];
    expect(soundSegments(scenes, lookup).map((s) => s.assetId)).toEqual(['clipA', 'clipB']);
  });

  it('audibleAt lists the clips heard at a time', () => {
    const segments = soundSegments([scene('photo', 4000, { media: 'clipA', clipSound: true })], lookup);
    expect(audibleAt(segments, 2000)).toEqual(new Set(['clipA']));
    expect(audibleAt(segments, 4000)).toEqual(new Set());
  });
});

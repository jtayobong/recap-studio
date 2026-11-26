import { describe, expect, it } from 'vitest';
import type { Scene } from '../domain/project';
import { audibleAt, soundSegments } from './clipSound';
import { isFieldVisible, resolveFields } from './fields';
import { createScene, getTemplate } from './templates/registry';

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
      { assetId: 'clipA', startMs: 3000, endMs: 7000, duckLevel: 0.3, volume: 1 },
      { assetId: 'clipB', startMs: 15_000, endMs: 16_500, duckLevel: 0.3, volume: 1 },
    ]);
  });

  it('every clip of a grid or carousel scene, each once; unknown assets are skipped', () => {
    const scenes = [scene('carousel', 6000, { clipSound: true, media1: 'clipA', media2: 'photo', media3: 'clipB', media4: 'clipA', media5: 'gone' })];
    expect(soundSegments(scenes, lookup).map((s) => s.assetId)).toEqual(['clipA', 'clipB']);
  });

  it("carries the scene's music level and clip volume (M10); older scenes get the earlier levels", () => {
    const [custom] = soundSegments([scene('photo', 4000, { media: 'clipA', clipSound: true, musicUnderClip: 10, clipVolume: 60 })], lookup);
    expect(custom).toMatchObject({ duckLevel: 0.1, volume: 0.6 });
    const old = { ...scene('carousel', 4000, {}), fields: { clipSound: true, media1: 'clipA' } }; // saved before M10
    expect(soundSegments([old], lookup)[0]).toMatchObject({ duckLevel: 0.3, volume: 1 });
    const [clamped] = soundSegments([scene('photo-grid', 4000, { media1: 'clipA', clipSound: true, musicUnderClip: 250, clipVolume: -5 })], lookup);
    expect(clamped).toMatchObject({ duckLevel: 1, volume: 0 });
  });

  it('the level fields show only while "Keep clip sound" is on, on every clip template', () => {
    for (const id of ['photo', 'photo-grid', 'carousel']) {
      const defs = getTemplate(id)!.fields;
      for (const key of ['musicUnderClip', 'clipVolume']) {
        expect(isFieldVisible(defs[key]!, resolveFields(defs, { clipSound: false }))).toBe(false);
        expect(isFieldVisible(defs[key]!, resolveFields(defs, { clipSound: true }))).toBe(true);
      }
    }
  });

  it('audibleAt gives each heard clip its volume (the loudest if heard twice)', () => {
    const segments = soundSegments(
      [scene('photo', 4000, { media: 'clipA', clipSound: true, clipVolume: 40 }), scene('photo', 4000, { media: 'clipA', clipSound: true, clipVolume: 70 })],
      lookup,
    );
    expect(audibleAt(segments, 1000)).toEqual(new Map([['clipA', 0.4]]));
    expect(audibleAt([...segments, { ...segments[0]!, volume: 0.9 }], 1000)).toEqual(new Map([['clipA', 0.9]]));
  });

  it('audibleAt lists the clips heard at a time', () => {
    const segments = soundSegments([scene('photo', 4000, { media: 'clipA', clipSound: true })], lookup);
    expect(audibleAt(segments, 2000)).toEqual(new Map([['clipA', 1]]));
    expect(audibleAt(segments, 4000)).toEqual(new Map());
  });
});

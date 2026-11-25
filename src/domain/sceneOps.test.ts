import { describe, expect, it } from 'vitest';
import { SCENE_MAX_MS, SCENE_MIN_MS, type Scene } from './project';
import {
  clampDuration,
  duplicateScene,
  indexOfScene,
  insertScene,
  moveScene,
  patchScene,
  removeScene,
  setSceneField,
} from './sceneOps';

const scene = (id: string, fields: Record<string, unknown> = {}): Scene => ({
  id,
  templateId: 'title',
  durationMs: 3000,
  fields,
  transitionIn: 'cut',
});

const ids = (scenes: Scene[]) => scenes.map((s) => s.id);
const abc = () => [scene('a'), scene('b'), scene('c')];

describe('scene operations', () => {
  it('inserts at a clamped index', () => {
    expect(ids(insertScene(abc(), scene('x'), 1))).toEqual(['a', 'x', 'b', 'c']);
    expect(ids(insertScene(abc(), scene('x'), 99))).toEqual(['a', 'b', 'c', 'x']);
    expect(ids(insertScene(abc(), scene('x'), -5))).toEqual(['x', 'a', 'b', 'c']);
  });

  it('removes by id, and returns the same array for unknown ids', () => {
    const list = abc();
    expect(ids(removeScene(list, 'b'))).toEqual(['a', 'c']);
    expect(removeScene(list, 'zzz')).toBe(list);
  });

  it('moves scenes in both directions', () => {
    expect(ids(moveScene(abc(), 0, 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveScene(abc(), 2, 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveScene(abc(), 1, 99))).toEqual(['a', 'c', 'b']);
  });

  it('treats out-of-range or same-place moves as no-ops', () => {
    const list = abc();
    expect(moveScene(list, 1, 1)).toBe(list);
    expect(moveScene(list, -1, 0)).toBe(list);
    expect(moveScene(list, 0, -3)).toBe(list);
  });

  it('duplicates right after the original with a deep copy of its fields', () => {
    const list = [scene('a', { nested: { n: 1 } }), scene('b')];
    const next = duplicateScene(list, 'a', 'a2');
    expect(ids(next)).toEqual(['a', 'a2', 'b']);
    expect(next[1]?.fields).toEqual({ nested: { n: 1 } });
    expect(next[1]?.fields).not.toBe(list[0]?.fields);
    expect(duplicateScene(list, 'missing', 'x')).toBe(list);
  });

  it('patches only when something changed, keeping other scenes identical', () => {
    const list = abc();
    const next = patchScene(list, 'b', { durationMs: 5000 });
    expect(next[1]?.durationMs).toBe(5000);
    expect(next[0]).toBe(list[0]);
    expect(next[2]).toBe(list[2]);
    expect(patchScene(list, 'b', { durationMs: 3000 })).toBe(list);
    expect(patchScene(list, 'missing', { durationMs: 1 })).toBe(list);
  });

  it('sets one field without touching the others', () => {
    const list = [scene('a', { title: 'Hi', kicker: 'Yo' })];
    const next = setSceneField(list, 'a', 'title', 'Hello');
    expect(next[0]?.fields).toEqual({ title: 'Hello', kicker: 'Yo' });
    expect(setSceneField(next, 'a', 'title', 'Hello')).toBe(next);
  });

  it('clamps durations to whole milliseconds in range', () => {
    expect(clampDuration(1234.6)).toBe(1235);
    expect(clampDuration(1)).toBe(SCENE_MIN_MS);
    expect(clampDuration(10_000_000)).toBe(SCENE_MAX_MS);
    expect(clampDuration(Number.NaN)).toBe(SCENE_MIN_MS);
  });

  it('finds scenes by id', () => {
    expect(indexOfScene(abc(), 'c')).toBe(2);
    expect(indexOfScene(abc(), 'nope')).toBe(-1);
  });
});

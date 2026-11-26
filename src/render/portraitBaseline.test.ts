import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Scene, Transition } from '../domain/project';
import type { MediaResolver } from './media';
import { renderFrame } from './renderFrame';
import { createScene, TEMPLATES } from './templates/registry';
import { createMockContext } from './testing/mockContext';

/**
 * Guard for the landscape work: portrait (9:16) output must not change. Every template is drawn
 * with and without media at several moments, in two palettes, plus every transition; the recorded
 * draw calls are hashed. The first run writes the hashes to the path in PORTRAIT_BASELINE (when
 * set); later runs compare against it. Without the variable the test only checks determinism.
 */

const MEDIA_ID = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
const media: MediaResolver = {
  frame: (id) => (id === MEDIA_ID ? { source: {} as CanvasImageSource, width: 1600, height: 1200, kind: 'image' } : undefined),
};

function withMedia(scene: Scene): Scene {
  const fields = { ...scene.fields };
  for (const key of Object.keys(fields)) if (key.startsWith('media')) fields[key] = MEDIA_ID;
  return { ...scene, fields };
}

function hashCalls(scenes: Scene[], paletteId: string, timeMs: number, resolver?: MediaResolver): string {
  const { ctx, calls } = createMockContext();
  renderFrame(ctx, { format: { width: 1080, height: 1920, fps: 30 }, style: { paletteId, fontPairId: 'heavy-grotesk', backgroundMotion: 'off' as const }, scenes }, timeMs, resolver);
  return createHash('sha256').update(JSON.stringify(calls)).digest('hex').slice(0, 16);
}

function portraitFingerprints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const template of TEMPLATES) {
    for (const paletteId of ['neon-pulse', 'mint-riot']) {
      for (const t of [0, 300, 800, 1500, 2600, 3900]) {
        const scene = { ...createScene(template.id, 'x'), transitionIn: 'cut' as Transition };
        out[`${template.id}/${paletteId}/${t}`] = hashCalls([scene], paletteId, t);
        out[`${template.id}/${paletteId}/${t}/media`] = hashCalls([withMedia(scene)], paletteId, t, media);
      }
    }
  }
  for (const kind of ['fade', 'slide', 'push', 'zoom', 'wipe', 'flash'] as Transition[]) {
    const scenes = [createScene('title', 'a'), { ...createScene('big-number', 'b'), transitionIn: kind }];
    for (const t of [3500 + 100, 3500 + 250]) out[`transition/${kind}/${t}`] = hashCalls(scenes, 'neon-pulse', t);
  }
  return out;
}

describe('portrait baseline', () => {
  it('portrait output is unchanged', () => {
    const current = portraitFingerprints();
    expect(portraitFingerprints()).toEqual(current); // deterministic
    const path = process.env.PORTRAIT_BASELINE;
    if (!path) return;
    if (!existsSync(path)) {
      writeFileSync(path, JSON.stringify(current, null, 1));
      return;
    }
    const baseline = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
    const changed = Object.keys(baseline).filter((key) => baseline[key] !== current[key]);
    expect(changed).toEqual([]);
  });
});

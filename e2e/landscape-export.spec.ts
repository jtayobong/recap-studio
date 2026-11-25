import { expect, test } from '@playwright/test';
import { makeWav, makeWebm } from './helpers/media';
import type * as DbExports from '../src/db/index';
import type * as ExportExports from '../src/export/exportStory';
import type * as InspectExports from '../src/export/testing/inspectExport';
import type * as MediaExports from '../src/media/index';
import type * as RegistryExports from '../src/render/templates/registry';

/**
 * Landscape (16:9) export, end to end: every template in a 1920×1080 project, with a photo, a clip
 * and music, exported in the worker and decoded; each scene's frame must match the preview's
 * renderer, and the file must be 1920×1080 with the story's length and the music in it.
 */

type Modules = {
  db: typeof DbExports;
  exporter: typeof ExportExports;
  inspect: typeof InspectExports;
  media: typeof MediaExports;
  registry: typeof RegistryExports;
};

test.setTimeout(240_000);

test('a 16:9 story with every template, media and music exports at 1920×1080, matching the preview', { tag: '@dev' }, async ({ page }, testInfo) => {
  const clip = await makeWebm(page, 1500);
  await page.goto('/system');
  const result = await page.evaluate(
    async ({ clipBase64, songBase64 }) => {
      const load = (path: string) => import(path);
      const m: Modules = {
        db: await load('/src/db/index.ts'),
        exporter: await load('/src/export/exportStory.ts'),
        inspect: await load('/src/export/testing/inspectExport.ts'),
        media: await load('/src/media/index.ts'),
        registry: await load('/src/render/templates/registry.ts'),
      };
      const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      // A textured photo, so crop/focus mistakes would show in the comparison.
      const canvas = new OffscreenCanvas(1600, 1200);
      const g = canvas.getContext('2d')!;
      const sky = g.createLinearGradient(0, 0, 1600, 1200);
      sky.addColorStop(0, '#ff7a18');
      sky.addColorStop(1, '#3d1a78');
      g.fillStyle = sky;
      g.fillRect(0, 0, 1600, 1200);
      for (let i = 0; i < 9; i += 1) {
        g.fillStyle = `hsl(${i * 40} 85% 60%)`;
        g.beginPath();
        g.arc(180 + i * 160, 300 + (i % 3) * 300, 120, 0, Math.PI * 2);
        g.fill();
      }
      const photo = new File([await canvas.convertToBlob({ type: 'image/png' })], 'photo.png');

      const project = await m.db.projectRepository.create({ name: 'Wide export', formatPresetId: 'landscape' });
      const { imported } = await m.media.importer.importFiles(
        [photo, new File([bytes(clipBase64)], 'clip.webm'), new File([bytes(songBase64)], 'song.wav')],
        project.id,
      );
      const [photoAsset, clipAsset, songAsset] = imported;
      const scene = (templateId: string, fields: Record<string, unknown> = {}) => {
        const base = m.registry.createScene(templateId);
        return { ...base, durationMs: 3000, fields: { ...base.fields, ...fields } };
      };
      const scenes = [
        scene('title'),
        scene('big-number'),
        scene('top-list'),
        scene('compare'),
        scene('photo', { media: photoAsset!.id, focusX: 0.3, focusY: 0.6 }),
        scene('photo', { media: clipAsset!.id, caption: 'A clip in 16:9' }),
        scene('photo-grid', { layout: 'three', media1: photoAsset!.id, media2: clipAsset!.id, media3: photoAsset!.id, caption: 'Side by side' }),
        scene('carousel', { media1: photoAsset!.id, media2: photoAsset!.id, media3: photoAsset!.id }),
        scene('outro'),
      ];
      const saved = await m.db.projectRepository.save({
        ...project,
        scenes,
        audio: { assetId: songAsset!.id, offsetMs: 0, volume: 1, fadeIn: false, fadeOut: true },
      });

      const file = await m.exporter.exportStory(saved, m.db.assetRepository);
      const assets = await m.exporter.gatherExportAssets(saved, m.db.assetRepository);
      // Each scene at its poster time, plus a moment inside a transition.
      const times = scenes.map((s, i) => i * 3000 + Math.min(m.registry.posterTimeMs(s), 2900));
      times.push(3200); // frame-aligned (frame 96) moment inside the Big Number entrance
      const report = await m.inspect.inspectExport(file.blob, saved, times, m.inspect.referenceMedia(assets));
      const audio = await m.inspect.inspectAudio(file.blob, [[1, 2]]);
      return {
        filename: file.filename,
        frames: file.totalFrames,
        failures: file.mediaFailures,
        music: file.music,
        report,
        audio,
        templates: scenes.map((s) => s.templateId),
        times,
      };
    },
    { clipBase64: clip.toString('base64'), songBase64: makeWav(30_000, 440, 22_050).toString('base64') },
  );

  const summary = [
    `${result.filename}: ${result.report.width}×${result.report.height}, ${result.report.durationS.toFixed(2)} s, ${result.frames} frames`,
    ...result.report.frameDiffs.map((d) => `  t=${d.timeMs} ms: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, pixels Δ>48 ${(d.badPixelShare * 100).toFixed(3)}%`),
  ].join('\n');
  console.log(`\n${summary}`);
  testInfo.annotations.push({ type: 'landscape export', description: summary });

  expect(result.failures).toEqual({});
  expect(result.frames).toBe(9 * 90);
  expect(result.report).toMatchObject({ width: 1920, height: 1080, packetCount: 810 });
  expect(result.report.durationS).toBeCloseTo(27, 1);
  for (const diff of result.report.frameDiffs) {
    expect(diff.meanAbsDiff, `frame at ${diff.timeMs} ms`).toBeLessThan(4);
    expect(diff.badPixelShare, `frame at ${diff.timeMs} ms`).toBeLessThan(0.005);
  }
  expect(result.music).toEqual({ included: true });
  expect(result.audio?.rms[0]).toBeGreaterThan(0.1);
});

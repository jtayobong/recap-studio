import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { makeImage, makeWav, makeWebm } from './helpers/media';
import type * as DbExports from '../src/db/index';
import type * as SceneActions from '../src/editor/sceneActions';
import type * as ExportExports from '../src/export/exportStory';
import type * as InspectExports from '../src/export/testing/inspectExport';
import type * as RegistryExports from '../src/render/templates/registry';

/**
 * M7 done-when: a new user picks a starter story, swaps in their own numbers, photos, a clip and
 * music, and exports something finished. Every scene (all new templates) and transition (incl.
 * the new ones) is compared between the export and the preview renderer fed with independently
 * decoded media.
 */

test.setTimeout(240_000);

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

async function choose(page: Page, slot: string, filename: string) {
  await inspector(page).getByRole('group', { name: slot }).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: filename }).click();
}

test('pick a starter, make it yours, export: every scene and transition matches the preview', { tag: '@dev' }, async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('My travel year');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  // 1. Starter story.
  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Travel year/ }).click();
  await expect(chips(page)).toHaveCount(7);

  // 2. Own numbers.
  await chips(page).nth(1).click();
  await inspector(page).getByLabel('Number', { exact: true }).fill('31415');

  // 3. Own media and music, through the library and slot pickers.
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'harbour.png', mimeType: 'image/png', buffer: await makeImage(page, 1600, 1200) },
    { name: 'street.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 1200, 1600, 'image/jpeg') },
    { name: 'sunset.png', mimeType: 'image/png', buffer: await makeImage(page, 2000, 1000) },
    { name: 'ferry.webm', mimeType: 'video/webm', buffer: await makeWebm(page, 1500) },
    { name: 'song.wav', mimeType: 'audio/wav', buffer: makeWav(40_000, 330, 22_050) },
  ]);
  await expect(page.getByRole('list', { name: 'Media library' }).getByRole('listitem')).toHaveCount(5);

  await chips(page).nth(2).click(); // carousel
  await choose(page, 'Photo 1', 'harbour.png');
  await choose(page, 'Photo 2', 'ferry.webm');
  await chips(page).nth(5).click(); // grid
  await choose(page, 'Photo 1', 'sunset.png');
  await inspector(page).getByRole('button', { name: 'Done' }).click();
  await choose(page, 'Song', 'song.wav');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  // Fill the remaining slots with the same editor action the inspector uses.
  await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts' as string)) as typeof DbExports;
    const actions = (await import('/src/editor/sceneActions.ts' as string)) as typeof SceneActions;
    const { useEditorStore } = await import('/src/store/editorStore.ts' as string);
    const project = useEditorStore.getState().project;
    const assets = await db.assetRepository.listForProject(project.id);
    const id = (name: string) => assets.find((a) => a.filename === name)!.id;
    const [, , carousel, , , grid] = project.scenes;
    actions.setSceneField(carousel.id, 'media3', id('street.jpg'));
    actions.setSceneField(carousel.id, 'media4', id('sunset.png'));
    actions.setSceneField(grid.id, 'media2', id('street.jpg'));
    actions.setSceneField(grid.id, 'media3', id('ferry.webm'));
    await useEditorStore.getState().flushSave();
  });

  // 4. Export and compare.
  const result = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts' as string)) as typeof DbExports;
    const exporter = (await import('/src/export/exportStory.ts' as string)) as typeof ExportExports;
    const inspect = (await import('/src/export/testing/inspectExport.ts' as string)) as typeof InspectExports;
    const registry = (await import('/src/render/templates/registry.ts' as string)) as typeof RegistryExports;
    const { useEditorStore } = await import('/src/store/editorStore.ts' as string);
    const project = useEditorStore.getState().project;
    const file = await exporter.exportStory(project, db.assetRepository);

    // Mid-scene (poster frame) and ~30 % into each entrance transition, snapped to frame times.
    const atFrame = (ms: number) => (Math.round((ms * 30) / 1000) * 1000) / 30;
    const times: number[] = [];
    let start = 0;
    for (const scene of project.scenes) {
      if (start > 0 && scene.transitionIn !== 'cut') times.push(atFrame(start + 135));
      times.push(atFrame(start + registry.posterTimeMs(scene)));
      start += scene.durationMs;
    }
    const assets = await exporter.gatherExportAssets(project, db.assetRepository);
    const report = await inspect.inspectExport(file.blob, project, times, inspect.referenceMedia(assets));
    const audio = await inspect.inspectAudio(file.blob, [[5, 6]]);

    // A few decoded frames for a human look (saved by the test runner).
    const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('/node_modules/.vite/deps/mediabunny.js' as string);
    const input = new Input({ source: new BlobSource(file.blob), formats: ALL_FORMATS });
    const sink = new CanvasSink(await input.getPrimaryVideoTrack(), { width: 270, height: 480, fit: 'fill' });
    const sheet = document.createElement('canvas');
    sheet.width = 270 * 7;
    sheet.height = 480;
    const ctx = sheet.getContext('2d')!;
    const posters = times.filter((_, i) => i % 2 === 0 || i === 0).slice(0, 7);
    for (const [i, t] of posters.entries()) {
      const wrapped = await sink.getCanvas(t / 1000 + 0.017);
      if (wrapped) ctx.drawImage(wrapped.canvas, i * 270, 0);
    }
    input.dispose();

    return {
      filename: file.filename,
      seconds: report.durationS,
      frames: file.totalFrames,
      failures: file.mediaFailures,
      music: file.music,
      audioRms: audio?.rms[0] ?? 0,
      diffs: report.frameDiffs,
      sheet: sheet.toDataURL('image/png').split(',')[1]!,
    };
  });

  // Also on disk (test-results/), for a quick look at what the export looks like.
  const sheetPath = testInfo.outputPath('export-frames.png');
  writeFileSync(sheetPath, Buffer.from(result.sheet, 'base64'));
  await testInfo.attach('export-frames', { path: sheetPath, contentType: 'image/png' });
  const summary = result.diffs.map((d) => `t=${Math.round(d.timeMs)}: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, Δ>48 ${(d.badPixelShare * 100).toFixed(3)}%`).join('\n');
  console.log(`\n${result.filename}: ${result.frames} frames, ${result.seconds.toFixed(2)} s, music ${JSON.stringify(result.music)}, rms ${result.audioRms.toFixed(3)}\n${summary}`);

  expect(result.filename).toBe('my-travel-year.mp4');
  expect(result.frames).toBe(1020); // 34 s × 30 fps
  expect(result.seconds).toBeCloseTo(34, 1);
  expect(result.failures).toEqual({});
  expect(result.music).toEqual({ included: true });
  expect(result.audioRms).toBeGreaterThan(0.2);
  expect(result.diffs).toHaveLength(13); // 7 scenes + 6 transitions
  for (const diff of result.diffs) {
    expect(diff.meanAbsDiff, `frame at ${diff.timeMs} ms`).toBeLessThan(4);
    expect(diff.badPixelShare, `frame at ${diff.timeMs} ms`).toBeLessThan(0.005);
  }
});

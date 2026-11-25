import { expect, test, type Page } from '@playwright/test';
import type * as DbExports from '../src/db/index';
import type * as ExportExports from '../src/export/exportStory';
import type * as InspectExports from '../src/export/testing/inspectExport';
import type * as TargetExports from '../src/export/target';
import type * as MediaExports from '../src/media/index';
import type * as RegistryExports from '../src/render/templates/registry';

/**
 * Export, end to end in Chromium (no UI yet): the app's modules are loaded from the dev server,
 * a project is built and exported in the worker, and the file is decoded and checked against
 * renderFrame. Timings are printed to the test output.
 */

type Modules = {
  db: typeof DbExports;
  exporter: typeof ExportExports;
  inspect: typeof InspectExports;
  target: typeof TargetExports;
  media: typeof MediaExports;
  registry: typeof RegistryExports;
};

test.setTimeout(180_000);

test.beforeEach(async ({ page }) => {
  await page.goto('/system');
  // Load every module once so later evaluate calls can use them via window.__m.
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    (window as unknown as { __m: unknown }).__m = {
      db: await load('/src/db/index.ts'),
      exporter: await load('/src/export/exportStory.ts'),
      inspect: await load('/src/export/testing/inspectExport.ts'),
      target: await load('/src/export/target.ts'),
      media: await load('/src/media/index.ts'),
      registry: await load('/src/render/templates/registry.ts'),
    };
  });
});

async function starterProject(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const m = (window as unknown as { __m: Modules }).__m;
    const project = await m.db.projectRepository.create({ name: 'Export: Starter!' });
    await m.db.projectRepository.save({ ...project, scenes: m.registry.createStarterScenes() });
    return project.id;
  });
}

test('the starter story exports in the worker: right format, size, length, frames match the preview', async ({ page }, testInfo) => {
  const projectId = await starterProject(page);
  const result = await page.evaluate(async (projectId) => {
    const m = (window as unknown as { __m: Modules }).__m;
    const project = (await m.db.projectRepository.get(projectId))!;
    let progressCalls = 0;
    let lastFraction = 0;
    const file = await m.exporter.exportStory(project, m.db.assetRepository, {
      onProgress: (fraction) => {
        progressCalls += 1;
        lastFraction = fraction;
      },
    });
    const report = await m.inspect.inspectExport(file.blob, project, [0, 500, 1500, 3000, 3700, 5000, 8000]);
    return {
      filename: file.filename,
      container: file.target.container,
      bitrate: file.bitrate,
      frames: file.totalFrames,
      elapsedMs: file.elapsedMs,
      bytes: file.blob.size,
      failures: file.mediaFailures,
      progressCalls,
      lastFraction,
      report,
    };
  }, projectId);

  const summary = [
    `${result.filename}: ${result.container} / ${result.report.codec}, ${result.bitrate / 1e6} Mbps target`,
    `${result.frames} frames in ${Math.round(result.elapsedMs)} ms (${(result.frames / (result.elapsedMs / 1000)).toFixed(0)} fps), ${(result.bytes / 1e6).toFixed(2)} MB`,
    ...result.report.frameDiffs.map((d) => `  t=${d.timeMs} ms: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, pixels Δ>48 ${(d.badPixelShare * 100).toFixed(3)}%`),
  ].join('\n');
  console.log(`\n${summary}`);
  testInfo.annotations.push({ type: 'export', description: summary });

  expect(result.filename).toMatch(/^export-starter\.(mp4|webm)$/);
  expect(result.bitrate).toBe(8_000_000);
  expect(result.frames).toBe(255);
  expect(result.failures).toEqual({});
  expect(result.progressCalls).toBeGreaterThan(0);
  expect(result.lastFraction).toBe(1);
  expect(result.report).toMatchObject({ width: 1080, height: 1920, packetCount: 255 });
  expect(result.report.durationS).toBeCloseTo(8.5, 1);
  for (const diff of result.report.frameDiffs) {
    expect(diff.meanAbsDiff, `frame at ${diff.timeMs} ms`).toBeLessThan(4);
    expect(diff.badPixelShare, `frame at ${diff.timeMs} ms`).toBeLessThan(0.005);
  }
});

test('the file plays in <video>; cancel stops the export; the WebM/VP9 fallback works', async ({ page }) => {
  const projectId = await starterProject(page);
  const result = await page.evaluate(async (projectId) => {
    const m = (window as unknown as { __m: Modules }).__m;
    const project = (await m.db.projectRepository.get(projectId))!;

    const short = await m.exporter.exportStory(project, m.db.assetRepository, { endMs: 2000 });
    const url = URL.createObjectURL(short.blob);
    const video = document.createElement('video');
    video.muted = true;
    const played = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      video.onloadeddata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error(video.error?.message ?? 'video error'));
      video.src = url;
    });
    URL.revokeObjectURL(url);

    const controller = new AbortController();
    const cancelled = await m.exporter
      .exportStory(project, m.db.assetRepository, { signal: controller.signal, onProgress: () => controller.abort() })
      .then(
        () => 'finished',
        (error: unknown) => (error instanceof DOMException ? error.name : String(error)),
      );

    const webm = await m.exporter.exportStory(project, m.db.assetRepository, { endMs: 1000, target: m.target.targetFor('webm') });
    const report = await m.inspect.inspectExport(webm.blob, project, [500]);
    return { played, cancelled, webm: { filename: webm.filename, type: webm.blob.type, report } };
  }, projectId);

  expect(result.played).toMatchObject({ width: 1080, height: 1920 });
  expect(result.played.duration).toBeCloseTo(2, 1);
  expect(result.cancelled).toBe('AbortError');
  expect(result.webm.filename).toBe('export-starter.webm');
  expect(result.webm.type).toBe('video/webm');
  expect(result.webm.report).toMatchObject({ codec: 'vp9', packetCount: 30 });
  expect(result.webm.report.frameDiffs[0]!.meanAbsDiff).toBeLessThan(4);
});

test('photos and clips are in the export, frame-exact; missing media is reported, not fatal', async ({ page }, testInfo) => {
  const result = await page.evaluate(async () => {
    const m = (window as unknown as { __m: Modules }).__m;

    // Test media: a solid green photo and a ~2 s clip that is red for 1 s, then blue.
    const greenCanvas = new OffscreenCanvas(1200, 800);
    const g = greenCanvas.getContext('2d')!;
    g.fillStyle = '#00ff00';
    g.fillRect(0, 0, 1200, 800);
    const green = new File([await greenCanvas.convertToBlob({ type: 'image/png' })], 'green.png');

    const clipCanvas = document.createElement('canvas');
    clipCanvas.width = 360;
    clipCanvas.height = 640;
    const c = clipCanvas.getContext('2d')!;
    let color = '#ff0000';
    const draw = () => {
      c.fillStyle = color;
      c.fillRect(0, 0, 360, 640);
    };
    draw();
    const recorder = new MediaRecorder(clipCanvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    const timer = setInterval(draw, 33);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    color = '#0000ff';
    await new Promise((resolve) => setTimeout(resolve, 1000));
    recorder.stop();
    await stopped;
    clearInterval(timer);
    const clip = new File(chunks, 'red-blue.webm', { type: 'video/webm' });

    // Project: photo (0–3 s), clip (3–7 s), photo whose asset was deleted (7–9 s). Cuts, no motion.
    const project = await m.db.projectRepository.create({ name: 'Media export' });
    const imported = await m.media.importer.importFiles([green, clip], project.id);
    const [photo, video] = imported.imported;
    const gone = await m.media.importer.importFile(green, project.id);
    await m.db.assetRepository.remove(gone.id);
    const scene = (media: string, durationMs: number) => ({
      ...m.registry.createScene('photo'),
      durationMs,
      transitionIn: 'cut' as const,
      fields: { media, caption: '', fit: 'cover', motion: 'none', focusX: 0.5, focusY: 0.5 },
    });
    const saved = await m.db.projectRepository.save({
      ...project,
      scenes: [scene(photo!.id, 3000), scene(video!.id, 4000), scene(gone.id, 2000)],
    });

    const file = await m.exporter.exportStory(saved, m.db.assetRepository);
    const at = (timeMs: number) => ({ timeMs, fx: 0.5, fy: 0.4 });
    const pixels = await m.inspect.samplePixels(file.blob, 30, [at(1500), at(3300), at(4600), at(6800), at(8000)]);
    return { pixels, failures: file.mediaFailures, goneId: gone.id, frames: file.totalFrames, elapsedMs: file.elapsedMs };
  });

  testInfo.annotations.push({ type: 'export', description: `media story: ${result.frames} frames in ${Math.round(result.elapsedMs)} ms` });
  const dominant = ([r, gr, b]: number[]) =>
    r! > 180 && gr! < 80 && b! < 80 ? 'red' : gr! > 180 && r! < 80 && b! < 80 ? 'green' : b! > 180 && r! < 80 && gr! < 80 ? 'blue' : 'mixed';

  expect(result.frames).toBe(270);
  expect(result.pixels.map(dominant)).toEqual([
    'green', // photo
    'red', // clip at 0.3 s
    'blue', // clip at 1.6 s
    'blue', // clip at 3.8 s: past its ~2 s end, the last frame holds
    'mixed', // deleted asset: placeholder
  ]);
  expect(Object.keys(result.failures)).toEqual([result.goneId]);
});

test('text renders the same in the export worker as in the preview, for every font pair and fallback scripts', async ({ page }, testInfo) => {
  const result = await page.evaluate(async () => {
    const m = (window as unknown as { __m: Modules }).__m;
    const presets = await import('/src/domain/stylePresets.ts' as string);
    const reports: { fontPairId: string; diffs: { timeMs: number; meanAbsDiff: number; badPixelShare: number }[] }[] = [];
    for (const pair of presets.FONT_PAIRS as { id: string }[]) {
      const project = await m.db.projectRepository.create({ name: `Fonts ${pair.id}` });
      const title = m.registry.createScene('title');
      const number = m.registry.createScene('big-number');
      const saved = await m.db.projectRepository.save({
        ...project,
        style: { ...project.style, fontPairId: pair.id },
        scenes: [
          {
            ...title,
            transitionIn: 'cut' as const,
            // Accents, a dash, emoji and CJK all need fallback fonts beyond the stack.
            fields: { ...title.fields, kicker: 'Ça va? — Grüße', title: 'Café ☀️\n東京 2026', subtitle: 'Ünïcödé, emoji 🎧🔥 and 한국어' },
          },
          { ...number, fields: { ...number.fields, label: 'Kilómetros 🚲', unit: 'km ✓' } },
        ],
      });
      // Let the page's own fonts settle before rendering the reference frames.
      await document.fonts.ready;
      const file = await m.exporter.exportStory(saved, m.db.assetRepository);
      const report = await m.inspect.inspectExport(file.blob, saved, [1500, 3000, 7000]);
      reports.push({ fontPairId: pair.id, diffs: report.frameDiffs });
    }
    return reports;
  });

  const summary = result
    .flatMap((r) => r.diffs.map((d) => `${r.fontPairId} t=${d.timeMs}: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, pixels Δ>48 ${(d.badPixelShare * 100).toFixed(3)}%`))
    .join('\n');
  console.log(`\n${summary}`);
  testInfo.annotations.push({ type: 'fonts', description: summary });
  expect(result.length).toBeGreaterThan(0);
  for (const report of result) {
    for (const diff of report.diffs) {
      expect(diff.meanAbsDiff, `${report.fontPairId} at ${diff.timeMs} ms`).toBeLessThan(4);
      expect(diff.badPixelShare, `${report.fontPairId} at ${diff.timeMs} ms`).toBeLessThan(0.005);
    }
  }
});

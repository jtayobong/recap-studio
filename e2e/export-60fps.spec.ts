import { expect, test } from '@playwright/test';
import { makeWav } from './helpers/media';
import type * as DbExports from '../src/db/index';
import type * as ExportExports from '../src/export/exportStory';
import type * as InspectExports from '../src/export/testing/inspectExport';
import type * as TargetExports from '../src/export/target';
import type * as MediaExports from '../src/media/index';
import type * as RegistryExports from '../src/render/templates/registry';

/**
 * 60 fps export (D35), end to end in Chromium: the app's modules are loaded from the dev server,
 * stories are exported at 60 fps in the worker, and the files are decoded and checked against
 * renderFrame at 60 fps frame times, including the frames between two 30 fps frames.
 */

type Modules = {
  db: typeof DbExports;
  exporter: typeof ExportExports;
  inspect: typeof InspectExports;
  target: typeof TargetExports;
  media: typeof MediaExports;
  registry: typeof RegistryExports;
};

test.setTimeout(240_000);

test.beforeEach(async ({ page }) => {
  await page.goto('/system');
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

test('a story with transitions and music exports at 60 fps: twice the frames, same length, frames and music in sync', { tag: '@dev' }, async ({ page }, testInfo) => {
  // 12 s tone with a silent gap at 4–5 s of the song; starting at 2 s puts the gap at 2–3 s of the story.
  const song = makeWav(12_000, 440, 44_100, [[4000, 5000]]);
  const result = await page.evaluate(async (base64) => {
    const m = (window as unknown as { __m: Modules }).__m;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const project = await m.db.projectRepository.create({ name: 'Sixty' });
    const asset = await m.media.importer.importFile(new File([bytes], 'song.wav'), project.id);
    const kinds = ['fade', 'slide', 'push', 'zoom'] as const;
    const templates = ['big-number', 'top-list', 'compare', 'outro'];
    const saved = await m.db.projectRepository.save({
      ...project,
      // 0.5 + 4 × 2 s = 8.5 s: a title, then four scenes, each entering with a 450 ms transition.
      scenes: [
        { ...m.registry.createScene('title'), durationMs: 500, transitionIn: 'cut' as const },
        ...kinds.map((kind, i) => ({ ...m.registry.createScene(templates[i]!), durationMs: 2000, transitionIn: kind })),
      ],
      audio: { assetId: asset.id, offsetMs: 2000, volume: 0.5, fadeIn: false, fadeOut: true },
    });

    const file = await m.exporter.exportStory(saved, m.db.assetRepository, { fps: 60 });
    // The reference draws at the export's frame times; the project itself is unchanged (30 fps).
    const at60 = { ...saved, format: { ...saved.format, fps: 60 as const } };
    // Odd 60 fps frames lie between two 30 fps frames: they only exist in a real 60 fps export.
    const oddFrame = (ms: number) => ((2 * Math.round((ms * 30) / 1000) + 1) * 1000) / 60;
    const times = [oddFrame(200), ...kinds.flatMap((_, i) => [oddFrame(500 + 2000 * i + 100), oddFrame(500 + 2000 * i + 300)]), oddFrame(8000)];
    const video = await m.inspect.inspectExport(file.blob, at60, times);
    const audio = await m.inspect.inspectAudio(file.blob, [
      [0.5, 1.5],
      [2.2, 2.8],
      [3.5, 6.5],
    ]);
    const stored = await m.db.projectRepository.get(saved.id);
    return {
      fps: file.fps,
      bitrate: file.bitrate,
      frames: file.totalFrames,
      elapsedMs: file.elapsedMs,
      container: file.target.container,
      music: file.music,
      storedFps: stored!.format.fps,
      video,
      audio,
    };
  }, song.toString('base64'));

  const summary = [
    `60 fps: ${result.frames} frames in ${Math.round(result.elapsedMs)} ms, ${result.container} ${result.video.codecString}, ${result.bitrate / 1e6} Mbps`,
    `decoded: ${result.video.durationS.toFixed(3)} s, ${result.video.packetCount} packets, ${result.video.averagePacketRate.toFixed(2)} packets/s`,
    ...result.video.frameDiffs.map((d) => `  t=${d.timeMs.toFixed(2)} ms: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, pixels Δ>48 ${(d.badPixelShare * 100).toFixed(3)}%`),
    `audio rms: ${result.audio?.rms.map((r) => r.toFixed(3)).join(', ')}`,
  ].join('\n');
  console.log(`\n${summary}`);
  testInfo.annotations.push({ type: '60 fps', description: summary });

  expect(result.fps).toBe(60);
  expect(result.storedFps).toBe(30);
  expect(result.bitrate).toBe(11_314_000);
  expect(result.frames).toBe(510);
  expect(result.video).toMatchObject({ width: 1080, height: 1920, packetCount: 510 });
  expect(result.video.durationS).toBeCloseTo(8.5, 1);
  expect(result.video.averagePacketRate).toBeCloseTo(60, 0);
  // H.264: High profile (0x64) at a level that allows 1080p at 60 fps (4.2 = 0x2a), not
  // Mediabunny's 30 fps level 4.0. The middle byte is constraint flags the encoder sets.
  if (result.container === 'mp4') expect(result.video.codecString?.toLowerCase()).toMatch(/^avc1\.64[0-9a-f]{2}(2a|3[2-4])$/);
  for (const diff of result.video.frameDiffs) {
    expect(diff.meanAbsDiff, `frame at ${diff.timeMs} ms`).toBeLessThan(4);
    expect(diff.badPixelShare, `frame at ${diff.timeMs} ms`).toBeLessThan(0.005);
  }
  // Music: same timing as at 30 fps (half volume ≈ 0.177; the gap at 2–3 s).
  expect(result.music).toEqual({ included: true });
  const audio = result.audio!;
  expect(audio.durationS).toBeGreaterThan(8.4);
  expect(audio.durationS).toBeLessThan(8.7);
  const [before, gap, after] = audio.rms;
  expect(before).toBeGreaterThan(0.15);
  expect(gap).toBeLessThan(0.01);
  expect(after).toBeGreaterThan(0.15);
});

test('a 30 fps clip in a 60 fps export is frame-exact (frames repeat); 16:9 and WebM/VP9 export at 60 fps too', { tag: '@dev' }, async ({ page }, testInfo) => {
  const result = await page.evaluate(async () => {
    const m = (window as unknown as { __m: Modules }).__m;

    // ~2 s clip at 30 fps: a ball crossing a shifting gradient, so a wrong frame would show.
    const clipCanvas = document.createElement('canvas');
    clipCanvas.width = 540;
    clipCanvas.height = 960;
    const c = clipCanvas.getContext('2d')!;
    const started = performance.now();
    const draw = () => {
      const t = (performance.now() - started) / 1000;
      const bg = c.createLinearGradient(0, 0, 0, 960);
      bg.addColorStop(0, `hsl(${(t * 90) % 360} 70% 45%)`);
      bg.addColorStop(1, `hsl(${(t * 90 + 120) % 360} 70% 30%)`);
      c.fillStyle = bg;
      c.fillRect(0, 0, 540, 960);
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(60 + t * 200, 480, 70, 0, Math.PI * 2);
      c.fill();
    };
    draw();
    const recorder = new MediaRecorder(clipCanvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    const timer = setInterval(draw, 33);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    recorder.stop();
    await stopped;
    clearInterval(timer);
    const clip = new File(chunks, 'ball.webm', { type: 'video/webm' });

    const project = await m.db.projectRepository.create({ name: 'Clip sixty' });
    const asset = await m.media.importer.importFile(clip, project.id);
    const photoScene = (fields: Record<string, unknown>) => {
      const base = m.registry.createScene('photo');
      return { ...base, durationMs: 3000, transitionIn: 'cut' as const, fields: { ...base.fields, media: asset.id, ...fields } };
    };
    const saved = await m.db.projectRepository.save({
      ...project,
      scenes: [photoScene({ fit: 'cover', motion: 'zoom-in' })],
    });
    const assets = await m.exporter.gatherExportAssets(saved, m.db.assetRepository);
    const at60 = (p: typeof saved) => ({ ...p, format: { ...p.format, fps: 60 as const } });

    // Consecutive 60 fps frames (even and odd), through the clip and past its end (held).
    const frameTimes = [30, 31, 32, 33, 61, 62, 63, 150].map((f) => (f * 1000) / 60);
    const file = await m.exporter.exportStory(saved, m.db.assetRepository, { fps: 60 });
    const portrait = await m.inspect.inspectExport(file.blob, at60(saved), frameTimes, m.inspect.referenceMedia(assets));

    // 16:9 at 60 fps (1 s).
    const landscapeProject = { ...saved, format: { ...saved.format, width: 1920, height: 1080 } };
    const wide = await m.exporter.exportStory(landscapeProject, m.db.assetRepository, { fps: 60, endMs: 1000 });
    const landscape = await m.inspect.inspectExport(wide.blob, at60(landscapeProject), [(31 * 1000) / 60], m.inspect.referenceMedia(assets));

    // WebM/VP9 fallback at 60 fps (1 s).
    const webmFile = await m.exporter.exportStory(saved, m.db.assetRepository, { fps: 60, endMs: 1000, target: m.target.targetFor('webm') });
    const webm = await m.inspect.inspectExport(webmFile.blob, at60(saved), [(45 * 1000) / 60], m.inspect.referenceMedia(assets));

    return { frames: file.totalFrames, failures: file.mediaFailures, portrait, landscape, webm, webmFrames: webmFile.totalFrames };
  });

  const summary = [
    `clip @60: ${result.portrait.packetCount} packets, ${result.portrait.codecString}`,
    ...result.portrait.frameDiffs.map((d) => `  t=${d.timeMs.toFixed(2)} ms: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, pixels Δ>48 ${(d.badPixelShare * 100).toFixed(3)}%`),
    `16:9 @60: ${result.landscape.width}×${result.landscape.height}, ${result.landscape.packetCount} packets, ${result.landscape.codecString}`,
    `WebM @60: ${result.webm.packetCount} packets, ${result.webm.codecString}`,
  ].join('\n');
  console.log(`\n${summary}`);
  testInfo.annotations.push({ type: '60 fps clip', description: summary });

  expect(result.failures).toEqual({});
  expect(result.frames).toBe(180);
  expect(result.portrait.packetCount).toBe(180);
  for (const report of [result.portrait, result.landscape, result.webm]) {
    for (const diff of report.frameDiffs) {
      expect(diff.meanAbsDiff, `frame at ${diff.timeMs} ms`).toBeLessThan(4);
      expect(diff.badPixelShare, `frame at ${diff.timeMs} ms`).toBeLessThan(0.005);
    }
  }
  expect(result.landscape).toMatchObject({ width: 1920, height: 1080, packetCount: 60 });
  expect(result.webm).toMatchObject({ codec: 'vp9', packetCount: 60 });
  expect(result.webmFrames).toBe(60);
  // (No VP9 level check: Mediabunny's WebM reader guesses the level from the picture size alone,
  // since VP9 frames carry none; the encoder was configured with level 4.1.)
});

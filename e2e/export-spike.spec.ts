import { expect, test } from '@playwright/test';
import type * as RegistryExports from '../src/render/templates/registry';
import type * as SpikeExports from '../src/export/spike';

/**
 * M5 spike: can we export a story to video in the browser, fast enough, matching the preview?
 * Renders the starter story (8.5 s, 1080×1920 @ 30 fps) in a worker and on the main thread,
 * then decodes the file and compares frames with renderFrame. Timings go to the test output.
 */

type Spike = typeof SpikeExports;
type Registry = typeof RegistryExports;

test.setTimeout(180_000);

test('export the starter story in a worker: playable, right size and length, frames match', async ({ page }, testInfo) => {
  await page.goto('/system');
  const result = await page.evaluate(async () => {
    const spike = (await import('/src/export/spike.ts' as string)) as Spike;
    const registry = (await import('/src/render/templates/registry.ts' as string)) as Registry;
    const project = {
      format: { width: 1080, height: 1920, fps: 30 as const },
      style: { paletteId: 'neon-pulse', fontPairId: 'heavy-grotesk' },
      scenes: registry.createStarterScenes(),
    };
    const bitrate = 8_000_000;
    const target = await spike.pickTarget(1080, 1920, bitrate);
    if (!target) throw new Error('This browser can encode neither H.264 nor VP9.');

    let progressEvents = 0;
    const worker = await spike.encodeInWorker({ project, ...target, bitrate }, () => (progressEvents += 1));
    const main = await spike.encodeOnMainThread({ project, ...target, bitrate });

    // Compare frames in each scene, mid-animation and settled, and inside the slide transition.
    const report = await spike.inspectExport(worker.data, worker.mimeType, project, [0, 500, 1500, 3000, 3700, 5000, 8000]);
    return {
      target,
      worker: { totalMs: worker.totalMs, drawMs: worker.drawMs, frames: worker.totalFrames, bytes: worker.data.byteLength, progressEvents },
      main: { totalMs: main.totalMs, drawMs: main.drawMs, bytes: main.data.byteLength },
      report,
    };
  });

  const { target, worker, main, report } = result;

  const fps = (frames: number, ms: number) => (frames / (ms / 1000)).toFixed(1);
  const summary = [
    `target: ${target.container} / ${target.codec} → ${report.codec}`,
    `worker: ${worker.frames} frames in ${Math.round(worker.totalMs)} ms (${fps(worker.frames, worker.totalMs)} fps; drawing ${Math.round(worker.drawMs)} ms), ${(worker.bytes / 1e6).toFixed(2)} MB, ${worker.progressEvents} progress messages`,
    `main thread: ${Math.round(main.totalMs)} ms (${fps(worker.frames, main.totalMs)} fps; drawing ${Math.round(main.drawMs)} ms)`,
    `30 s story estimate (worker): ${((worker.totalMs / worker.frames) * 900 / 1000).toFixed(1)} s`,
    `decoded: ${report.width}×${report.height}, ${report.durationS.toFixed(3)} s, ${report.packetCount} packets`,
    ...report.frameDiffs.map((d) => `  t=${d.timeMs} ms: mean |Δ| ${d.meanAbsDiff.toFixed(2)}, pixels Δ>48: ${(d.badPixelShare * 100).toFixed(3)}%`),
  ].join('\n');
  console.log(`\n${summary}`);
  testInfo.annotations.push({ type: 'spike', description: summary });

  expect(worker.frames).toBe(255); // 8.5 s × 30 fps
  expect(report.packetCount).toBe(255);
  expect(report.width).toBe(1080);
  expect(report.height).toBe(1920);
  expect(report.durationS).toBeCloseTo(8.5, 1);
  expect(worker.progressEvents).toBeGreaterThan(0);
  for (const diff of report.frameDiffs) {
    expect(diff.meanAbsDiff, `frame at ${diff.timeMs} ms`).toBeLessThan(4);
    expect(diff.badPixelShare, `frame at ${diff.timeMs} ms`).toBeLessThan(0.005);
  }
});

test('the export plays in a <video> element; cancel stops the worker; the WebM/VP9 fallback works', async ({ page }) => {
  await page.goto('/system');
  const result = await page.evaluate(async () => {
    const spike = (await import('/src/export/spike.ts' as string)) as Spike;
    const registry = (await import('/src/render/templates/registry.ts' as string)) as Registry;
    const project = {
      format: { width: 1080, height: 1920, fps: 30 as const },
      style: { paletteId: 'citrus-pop', fontPairId: 'heavy-grotesk' },
      scenes: registry.createStarterScenes(),
    };
    const bitrate = 8_000_000;
    const target = (await spike.pickTarget(1080, 1920, bitrate))!;

    // 1. Playable by the browser's own player.
    const short = await spike.encodeInWorker({ project, ...target, bitrate, endMs: 2000 });
    const url = URL.createObjectURL(new Blob([short.data], { type: short.mimeType }));
    const video = document.createElement('video');
    video.muted = true;
    const played = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      video.onloadeddata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error(video.error?.message ?? 'video error'));
      video.src = url;
    });
    URL.revokeObjectURL(url);

    // 2. Cancel after the first progress message.
    const controller = new AbortController();
    let progressBeforeCancel = 0;
    const cancelled = await spike
      .encodeInWorker(
        { project, ...target, bitrate },
        () => {
          progressBeforeCancel += 1;
          controller.abort();
        },
        controller.signal,
      )
      .then(
        () => 'finished',
        (error: unknown) => (error instanceof DOMException ? error.name : String(error)),
      );

    // 3. VP9 in WebM, the fallback for browsers without an H.264 encoder.
    const webm = await spike.encodeInWorker({ project, container: 'webm', codec: 'vp9', bitrate, endMs: 1000 });
    const webmReport = await spike.inspectExport(webm.data, webm.mimeType, project, [500]);

    return { played, cancelled, progressBeforeCancel, webm: { codec: webmReport.codec, frames: webmReport.packetCount, diff: webmReport.frameDiffs[0] } };
  });

  expect(result.played.width).toBe(1080);
  expect(result.played.height).toBe(1920);
  expect(result.played.duration).toBeCloseTo(2, 1);
  expect(result.cancelled).toBe('AbortError');
  expect(result.progressBeforeCancel).toBeGreaterThan(0);
  expect(result.webm.codec).toBe('vp9');
  expect(result.webm.frames).toBe(30);
  expect(result.webm.diff?.meanAbsDiff).toBeLessThan(4);
});

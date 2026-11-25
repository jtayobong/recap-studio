import { expect, test } from '@playwright/test';
import type * as DbExports from '../src/db/index';
import type * as ProbeExports from '../src/media/browserProbe';
import type * as MediaExports from '../src/media/index';

/**
 * Exercises the browser-only parts of the import pipeline (decode, downscale, thumbnails, video
 * metadata, OPFS streaming) in real Chromium by loading the app's modules from the dev server.
 * Media is generated in the page: images with OffscreenCanvas, video with MediaRecorder.
 * The UI flow (drop a file into the library) is covered once the media panel exists.
 */

type ProbeModule = typeof ProbeExports;
type MediaModule = typeof MediaExports;
type DbModule = typeof DbExports;

test.beforeEach(async ({ page }) => {
  await page.goto('/system');
});

test('images: small ones are kept as-is, large ones downscaled, both get a thumbnail', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createBrowserProbe } = (await import('/src/media/browserProbe.ts' as string)) as ProbeModule;
    const probe = createBrowserProbe();

    async function makeImage(width: number, height: number, type: string) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ff3366';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#2233ff';
      ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
      return canvas.convertToBlob({ type, quality: 0.9 });
    }
    async function size(blob: Blob) {
      const bitmap = await createImageBitmap(blob);
      const result = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    }

    const small = await makeImage(800, 600, 'image/jpeg');
    const smallResult = await probe.image(small, 'image/jpeg');

    const large = await makeImage(4000, 3000, 'image/png');
    const largeResult = await probe.image(large, 'image/png');

    const broken = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])]);
    const brokenError = await probe.image(broken, 'image/png').then(
      () => null,
      (e: unknown) => String(e),
    );

    return {
      small: { width: smallResult.width, height: smallResult.height, same: smallResult.data === small, mime: smallResult.mime },
      smallThumb: smallResult.thumbnail ? { type: smallResult.thumbnail.type, ...(await size(smallResult.thumbnail)) } : null,
      large: { width: largeResult.width, height: largeResult.height, mime: largeResult.mime },
      largeStored: await size(largeResult.data),
      largeThumb: largeResult.thumbnail ? await size(largeResult.thumbnail) : null,
      brokenError,
    };
  });

  expect(result.small).toEqual({ width: 800, height: 600, same: true, mime: 'image/jpeg' });
  expect(result.smallThumb).toEqual({ type: 'image/webp', width: 480, height: 360 });
  expect(result.large).toEqual({ width: 2160, height: 1620, mime: 'image/png' });
  expect(result.largeStored).toEqual({ width: 2160, height: 1620 });
  expect(result.largeThumb).toEqual({ width: 480, height: 360 });
  expect(result.brokenError).not.toBeNull();
});

test('video: reads size and duration (even when the file has none) and grabs a poster', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createBrowserProbe } = (await import('/src/media/browserProbe.ts' as string)) as ProbeModule;

    // Record ~1.5 s of animated canvas to WebM. MediaRecorder output has no duration header.
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = `hsl(${(frame += 12) % 360} 80% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
    };
    draw();
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    const timer = setInterval(draw, 33);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    recorder.stop();
    await stopped;
    clearInterval(timer);
    const webm = new Blob(chunks, { type: 'video/webm' });

    const probe = createBrowserProbe();
    const probed = await probe.video(webm);
    const broken = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 9, 9, 9])]);
    const brokenError = await probe.video(broken).then(
      () => null,
      (e: unknown) => String(e),
    );
    return {
      width: probed.width,
      height: probed.height,
      durationMs: probed.durationMs,
      thumbnailType: probed.thumbnail?.type ?? null,
      brokenError,
    };
  });

  expect(result).toMatchObject({ width: 320, height: 240, thumbnailType: 'image/webp' });
  expect(result.durationMs).toBeGreaterThan(1000);
  expect(result.durationMs).toBeLessThan(2500);
  expect(result.brokenError).not.toBeNull();
});

test('full import streams into OPFS and deleting the project removes the files', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { importer } = (await import('/src/media/index.ts' as string)) as MediaModule;
    const { assetRepository, projectRepository } = (await import('/src/db/index.ts' as string)) as DbModule;

    const canvas = new OffscreenCanvas(3000, 1000);
    canvas.getContext('2d')!.fillRect(0, 0, 3000, 1000);
    const png = new File([await canvas.convertToBlob({ type: 'image/png' })], 'wide.png');
    const disguised = new File(['<script>alert(1)</script>'], 'evil.jpg', { type: 'image/jpeg' });

    const project = await projectRepository.create({ name: 'Media test' });
    const fractions: number[] = [];
    const { imported, failed } = await importer.importFiles([png, disguised], project.id, {
      onProgress: (p) => p.fraction !== undefined && fractions.push(p.fraction),
    });
    const asset = imported[0]!;

    async function opfsFiles() {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for (const dir of ['assets', 'thumbs']) {
        try {
          const handle = await root.getDirectoryHandle(dir);
          for await (const entry of handle.values()) names.push(`${dir}/${entry.name}`);
        } catch {
          /* directory not created yet */
        }
      }
      return names.sort();
    }

    const stored = await assetRepository.readFile(asset.id);
    const filesAfterImport = await opfsFiles();
    await projectRepository.remove(project.id);

    return {
      asset: { kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height, bytes: asset.bytes },
      storedSize: stored?.size,
      lastFraction: fractions.at(-1),
      failed: failed.map((f) => ({ filename: f.filename, reason: f.error.reason })),
      filesAfterImport,
      expectedFiles: [`assets/${asset.id}`, `thumbs/${asset.id}.webp`],
      filesAfterDelete: await opfsFiles(),
      rowsAfterDelete: (await assetRepository.listForProject(project.id)).length,
    };
  });

  expect(result.asset).toMatchObject({ kind: 'image', mime: 'image/png', width: 2160, height: 720 });
  expect(result.storedSize).toBe(result.asset.bytes);
  expect(result.lastFraction).toBe(1);
  expect(result.failed).toEqual([{ filename: 'evil.jpg', reason: 'unsupported' }]);
  expect(result.filesAfterImport).toEqual(result.expectedFiles);
  expect(result.filesAfterDelete).toEqual([]);
  expect(result.rowsAfterDelete).toBe(0);
});

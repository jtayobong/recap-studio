import { expect, test, type Page } from '@playwright/test';
import type * as PlaybackExports from '../src/preview/playbackStore';

/**
 * Media in the live preview and scene thumbnails, checked by reading canvas pixels.
 * Test media is solid colours so the expected pixels are unambiguous.
 */

type PlaybackModule = typeof PlaybackExports;
type Rgb = [number, number, number];

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function solidImage(page: Page, color: string, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ color, width, height }) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    },
    { color, width, height },
  );
  return Buffer.from(base64, 'base64');
}

/** ~2 s WebM: red for the first second, blue after. */
async function redThenBlueWebm(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 284;
    const ctx = canvas.getContext('2d')!;
    let color = '#ff0000';
    const draw = () => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    draw();
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
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
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

async function pixel(page: Page, selector: string, fx: number, fy: number): Promise<Rgb> {
  return page.evaluate(
    ({ selector, fx, fy }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(selector)!;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1).data;
      return [data[0]!, data[1]!, data[2]!] as Rgb;
    },
    { selector, fx, fy },
  );
}

const previewPixel = (page: Page, fx: number, fy: number) => pixel(page, '[data-testid="preview-canvas"]', fx, fy);

/** The channel that clearly dominates, or 'mixed'. */
function dominant([r, g, b]: Rgb): 'red' | 'green' | 'blue' | 'mixed' {
  if (r > 180 && g < 80 && b < 80) return 'red';
  if (g > 180 && r < 80 && b < 80) return 'green';
  if (b > 180 && r < 80 && g < 80) return 'blue';
  return 'mixed';
}

async function seek(page: Page, ms: number) {
  await page.evaluate(async (ms) => {
    const { usePlaybackStore } = (await import('/src/preview/playbackStore.ts' as string)) as PlaybackModule;
    usePlaybackStore.getState().pause();
    usePlaybackStore.getState().seek(ms);
  }, ms);
}

async function photoSceneWith(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[], choose: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await page.getByLabel('Import media files').setInputFiles(files);
  await expect(page.getByRole('list', { name: 'Media library' }).getByRole('listitem')).toHaveCount(files.length);
  await page.getByRole('button', { name: /Photo \/ Video/ }).click();
  await inspector(page).getByLabel('Transition in').selectOption('cut');
  await inspector(page).getByLabel('Caption').fill('');
  await inspector(page).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo or clip' }).getByRole('button', { name: choose }).click();
}

test('a framed photo sits inside the frame; full screen fills the preview and the scene thumbnail; "show all" letterboxes it', { tag: '@dev' }, async ({ page }) => {
  await page.goto('/');
  const green = await solidImage(page, '#00ff00', 1600, 900);
  await photoSceneWith(page, [{ name: 'green.png', mimeType: 'image/png', buffer: green }], 'green.png');
  await seek(page, 2000);

  // Framed (the default since M12.6): the photo in the middle, the background around it.
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.5))).toBe('green');
  expect(dominant(await previewPixel(page, 0.5, 0.02))).not.toBe('green');
  await inspector(page).getByLabel('Layout').selectOption('full');

  // Cover: the whole frame is the photo.
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.5))).toBe('green');
  expect(dominant(await previewPixel(page, 0.5, 0.05))).toBe('green');

  // The strip thumbnail draws it too (from the stored thumbnail).
  await expect.poll(async () => dominant(await pixel(page, 'canvas.scene-thumb', 0.5, 0.4))).toBe('green');

  // Contain: a 16:9 photo in a 9:16 frame → photo in the middle, dimmed backdrop at the top.
  await inspector(page).getByLabel('Fit').selectOption('contain');
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.05))).toBe('mixed');
  expect(dominant(await previewPixel(page, 0.5, 0.5))).toBe('green');

  // Clearing the slot brings back the placeholder.
  await inspector(page).getByRole('button', { name: 'Clear' }).click();
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.5))).toBe('mixed');
});

test('a clip follows the playhead when seeking and while playing', { tag: '@dev' }, async ({ page }) => {
  await page.goto('/');
  const webm = await redThenBlueWebm(page);
  await photoSceneWith(page, [{ name: 'red-blue.webm', mimeType: 'video/webm', buffer: webm }], 'red-blue.webm');

  await seek(page, 300);
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.4)), { timeout: 10_000 }).toBe('red');

  await seek(page, 1600);
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.4)), { timeout: 10_000 }).toBe('blue');

  // Scene (4 s) is longer than the clip (~2 s): the last frame holds.
  await seek(page, 3800);
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.4)), { timeout: 10_000 }).toBe('blue');

  // Back to the start, then play: the clip plays along.
  await seek(page, 100);
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.4)), { timeout: 10_000 }).toBe('red');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(1700);
  expect(dominant(await previewPixel(page, 0.5, 0.4))).toBe('blue');
});

test('the focus point picks which part of a cropped photo stays in frame', { tag: '@dev' }, async ({ page }) => {
  await page.goto('/');
  // 2:1 image: left half red, right half blue. A 9:16 crop shows only a narrow vertical strip.
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(2000, 1000);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(1000, 0, 1000, 1000);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  await photoSceneWith(page, [{ name: 'split.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }], 'split.png');
  await seek(page, 2000);

  const pad = page.getByTestId('focus-pad');
  await expect(pad).toHaveAccessibleName('Focus point: 50% across, 50% down');

  // Click near the left edge: the red half fills the frame. (Raw mouse input needs it on screen.)
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await expect(pad).toHaveAccessibleName(/^Focus point: [0-2]% across, 50% down$/);
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.4))).toBe('red');

  // Keyboard: Home re-centers, Shift+→ takes big steps to the right edge.
  await pad.focus();
  await page.keyboard.press('Home');
  await expect(pad).toHaveAccessibleName('Focus point: 50% across, 50% down');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await expect(pad).toHaveAccessibleName('Focus point: 100% across, 50% down');
  await expect.poll(async () => dominant(await previewPixel(page, 0.5, 0.4))).toBe('blue');

  // A drag is one undo step, separate from the key presses just before it.
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.mouse.down();
  for (const f of [0.7, 0.5, 0.3, 0.1]) await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
  await page.mouse.up();
  await expect(pad).toHaveAccessibleName('Focus point: 10% across, 50% down');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pad).toHaveAccessibleName('Focus point: 100% across, 50% down');

  // Focus only matters when cropping.
  await inspector(page).getByLabel('Fit').selectOption('contain');
  await expect(inspector(page)).toContainText('The focus point applies when Fit is “Fill the screen”.');
});

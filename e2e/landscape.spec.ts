import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeImage, makeWav } from './helpers/media';

const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');
const preview = (page: Page) => page.getByTestId('preview-canvas');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function canvasSize(page: Page) {
  return preview(page).evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
}

test('a 16:9 project: create, preview, thumbnails, switch format and undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Wide recap');
  // The radios are visually hidden inside their cards: click the card, as a user would.
  await dialog.locator('label', { hasText: 'Landscape' }).click();
  await expect(dialog.getByRole('radio', { name: /Landscape/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /Square/ })).toBeDisabled(); // still "Later"
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);

  // The preview is a wide 1920×1080 canvas, shown wider than tall.
  expect(await canvasSize(page)).toEqual({ width: 1920, height: 1080 });
  const box = (await preview(page).boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 1);

  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Travel year/ }).click();
  await expect(chips(page)).toHaveCount(7);
  // Strip thumbnails are 16:9 too.
  const thumb = (await chips(page).first().locator('canvas').boundingBox())!;
  expect(thumb.width / thumb.height).toBeCloseTo(16 / 9, 1);

  // The project panel shows the format; switching to 9:16 is one undo step.
  await page.keyboard.press('Escape');
  const format = inspector(page).getByRole('group', { name: 'Format' });
  await expect(format.getByRole('radio', { name: /Landscape/ })).toBeChecked();
  await expect(format.getByRole('radio', { name: /Square/ })).toHaveCount(0); // only choosable formats
  await format.locator('label', { hasText: 'Story' }).click();
  await expect.poll(() => canvasSize(page)).toEqual({ width: 1080, height: 1920 });
  await expect(inspector(page)).toContainText('9:16 · 1080×1920');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => canvasSize(page)).toEqual({ width: 1920, height: 1080 });
  await expect(format.getByRole('radio', { name: /Landscape/ })).toBeChecked();
  await expect(chips(page)).toHaveCount(7); // scenes untouched

  // Saved as 16:9.
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  expect(await canvasSize(page)).toEqual({ width: 1920, height: 1080 });
});

test('a 16:9 starter with own photo and song exports as a 1920×1080 MP4 that plays', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Wide trip');
  await dialog.locator('label', { hasText: 'Landscape' }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Travel year/ }).click();
  await expect(chips(page)).toHaveCount(7);

  await page.getByLabel('Import media files').setInputFiles([
    { name: 'beach.png', mimeType: 'image/png', buffer: await makeImage(page, 1600, 1000) },
    { name: 'road.wav', mimeType: 'audio/wav', buffer: makeWav(40_000, 440, 22_050) },
  ]);
  await expect(page.getByRole('list', { name: 'Media library' }).getByRole('listitem')).toHaveCount(2);
  await chips(page).nth(5).click(); // the photo grid
  await inspector(page).getByRole('group', { name: 'Photo 1' }).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo 1' }).getByRole('button', { name: 'beach.png' }).click();
  await inspector(page).getByRole('button', { name: 'Done' }).click();
  await inspector(page).getByRole('group', { name: 'Song' }).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose song' }).getByRole('button', { name: 'road.wav' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(exportDialog).toContainText('16:9 · 1920×1080 · 30 fps');
  await exportDialog.getByRole('button', { name: 'Start export' }).click();
  const status = page.getByRole('status', { name: 'Export' });
  await expect(status).toContainText('✓ wide-trip.mp4', { timeout: 120_000 });

  const downloading = page.waitForEvent('download');
  await status.getByRole('link', { name: 'Download' }).click();
  const path = testInfo.outputPath('wide-trip.mp4');
  await (await downloading).saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.includes(Buffer.from('mp4a', 'latin1'))).toBe(true); // the music is in it

  const played = await page.evaluate(async (base64) => {
    const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' });
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('not playable'));
    });
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  }, bytes.toString('base64'));
  expect(played.width).toBe(1920);
  expect(played.height).toBe(1080);
  expect(played.duration).toBeGreaterThan(33);
  expect(played.duration).toBeLessThan(35);
});

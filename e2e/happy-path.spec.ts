import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeImage, makeWav } from './helpers/media';

/**
 * M8 done-when, happy path, through the UI only (also runs against the production build):
 * new project → starter story → own number, photo and music → export → download a playable MP4
 * that has both a video and an audio track.
 */

test.setTimeout(120_000);

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

/** Whether an ISO-BMFF file contains a box/sample-entry type (e.g. 'avc1', 'mp4a'). */
const hasFourCC = (bytes: Buffer, fourCC: string) => bytes.includes(Buffer.from(fourCC, 'latin1'));

test('a new user makes a story from a starter and downloads it, with music', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make your first recap' })).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Happy path');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Music year/ }).click();
  await expect(chips(page)).toHaveCount(7);

  // Own number.
  await chips(page).nth(1).click();
  await inspector(page).getByLabel('Number', { exact: true }).fill('52000');

  // Own photo and song.
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'concert.png', mimeType: 'image/png', buffer: await makeImage(page, 1600, 1200) },
    { name: 'anthem.wav', mimeType: 'audio/wav', buffer: makeWav(40_000, 440, 22_050) },
  ]);
  await expect(page.getByRole('list', { name: 'Media library' }).getByRole('listitem')).toHaveCount(2);
  await chips(page).nth(5).click(); // the photo scene
  await inspector(page).getByRole('group', { name: 'Photo or clip' }).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo or clip' }).getByRole('button', { name: 'concert.png' }).click();
  await inspector(page).getByRole('button', { name: 'Done' }).click();
  await inspector(page).getByRole('group', { name: 'Song' }).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose song' }).getByRole('button', { name: 'anthem.wav' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  // Export with the default quality, with the rights note shown.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(exportDialog).toContainText('Make sure you have the rights to use this music');
  await exportDialog.getByRole('button', { name: 'Start export' }).click();
  const status = page.getByRole('status', { name: 'Export' });
  await expect(status).toContainText('✓ happy-path.mp4', { timeout: 90_000 });
  await expect(status).not.toContainText('no music');

  const downloading = page.waitForEvent('download');
  await status.getByRole('link', { name: 'Download' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('happy-path.mp4');
  const path = testInfo.outputPath('happy-path.mp4');
  await download.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  expect(hasFourCC(bytes, 'avc1')).toBe(true); // H.264 video track
  expect(hasFourCC(bytes, 'mp4a')).toBe(true); // AAC audio track (the music)
  expect(bytes.length).toBeGreaterThan(500_000);

  // It plays in the browser's own player, for the story's length (33 s).
  const duration = await page.evaluate(async (base64) => {
    const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' });
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('not playable'));
    });
    return video.duration;
  }, bytes.toString('base64'));
  expect(duration).toBeGreaterThan(32);
  expect(duration).toBeLessThan(34);
});

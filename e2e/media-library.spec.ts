import { expect, test, type Page } from '@playwright/test';
import { makeAudioWebm, makeImage, makeWav, makeWebm } from './helpers/media';

async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
}

const library = (page: Page) => page.getByRole('list', { name: 'Media library' });
const tile = (page: Page, name: string) => library(page).getByRole('listitem', { name });

test('import photos and clips, survive a reload, and delete', async ({ page }) => {
  await createProject(page, 'Media library');
  await expect(page.getByText('No media yet.')).toBeVisible();

  const png = await makeImage(page, 3000, 2000);
  const webm = await makeWebm(page);
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'beach.png', mimeType: 'image/png', buffer: png },
    { name: 'party.webm', mimeType: 'video/webm', buffer: webm },
    { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('definitely not a jpeg') },
  ]);

  await expect(page.getByRole('status').filter({ hasText: 'Imported 2 of 3 files.' })).toBeAttached();
  await expect(page.getByRole('alert')).toContainText('“notes.jpg” isn’t a supported photo, video or audio file.');

  await expect(tile(page, 'beach.png')).toBeVisible();
  await expect(tile(page, 'beach.png').locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(tile(page, 'beach.png')).toContainText('Not used');
  await expect(tile(page, 'party.webm')).toContainText(/0:0[12]/); // duration badge

  // Dismiss the error.
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Everything is still there after a reload, in import order.
  await page.reload();
  await expect(library(page).getByRole('listitem')).toHaveText([/beach\.png/, /party\.webm/]);

  // Delete asks first; cancel keeps it.
  await tile(page, 'beach.png').hover();
  await page.getByRole('button', { name: 'Delete beach.png' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete media?' });
  await expect(dialog).toContainText('This can’t be undone.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(tile(page, 'beach.png')).toBeVisible();

  await page.getByRole('button', { name: 'Delete beach.png' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(tile(page, 'beach.png')).toHaveCount(0);
  await page.reload();
  await expect(library(page).getByRole('listitem')).toHaveText([/party\.webm/]);
});

test('files can be dropped onto the media panel', async ({ page }) => {
  await createProject(page, 'Drop test');
  const png = await makeImage(page, 400, 300);

  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }));
    return transfer;
  }, [...png]);
  const panel = page.getByRole('region', { name: 'Media' });
  await panel.dispatchEvent('dragenter', { dataTransfer });
  await panel.dispatchEvent('dragover', { dataTransfer });
  await panel.dispatchEvent('drop', { dataTransfer });

  await expect(tile(page, 'dropped.png')).toBeVisible();
});

test('a library item whose file is gone is shown as missing', async ({ page }) => {
  await createProject(page, 'Missing file');
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'gone.png', mimeType: 'image/png', buffer: await makeImage(page, 200, 200) },
  ]);
  await expect(tile(page, 'gone.png')).toBeVisible();

  // Simulate the browser clearing the stored file but not the database row.
  await page.evaluate(async () => {
    const assets = await (await navigator.storage.getDirectory()).getDirectoryHandle('assets');
    for await (const name of assets.keys()) await assets.removeEntry(name);
  });
  await page.reload();
  await expect(tile(page, 'gone.png')).toContainText('Missing file');
});

test('music imports into the library (WAV, and an audio-only WebM) but not into photo slots', async ({ page }) => {
  await createProject(page, 'Music import');
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'tone.wav', mimeType: 'audio/wav', buffer: makeWav(2200) },
    { name: 'voice-memo.webm', mimeType: 'video/webm', buffer: await makeAudioWebm(page, 1500) },
    { name: 'photo.png', mimeType: 'image/png', buffer: await makeImage(page, 400, 300) },
  ]);
  await expect(page.getByRole('status').filter({ hasText: 'Imported 3 files.' })).toBeAttached();

  // Audio tiles: a music note, the duration, and "Music" in the details.
  await expect(tile(page, 'tone.wav')).toContainText('♪');
  await expect(tile(page, 'tone.wav')).toContainText('0:02');
  await expect(tile(page, 'tone.wav')).toContainText(/Music · 0:02/);
  // Recorded as WebM with no picture: detected as audio, not rejected as a broken video.
  await expect(tile(page, 'voice-memo.webm')).toContainText(/Music · 0:0[12]/);

  // Photo/clip slots only offer photos and clips.
  await page.getByRole('button', { name: /Photo \/ Video/ }).click();
  await page.getByRole('button', { name: 'Choose…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose photo or clip' });
  await expect(picker.getByRole('button', { name: 'photo.png' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'tone.wav' })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'voice-memo.webm' })).toHaveCount(0);

  // Survives a reload.
  await page.reload();
  await expect(tile(page, 'tone.wav')).toContainText('0:02');
});

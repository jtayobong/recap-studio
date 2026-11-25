import { expect, test, type Page } from '@playwright/test';
import { makeImage, makeWav } from './helpers/media';

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const music = (page: Page) => inspector(page).getByRole('region', { name: 'Music' });
const songSlot = (page: Page) => music(page).getByRole('group', { name: 'Song' });
const library = (page: Page) => page.getByRole('list', { name: 'Media library' });

async function projectWithLibrary(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await page.getByRole('button', { name: 'Add starter scenes' }).click(); // 8.5 s story
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'anthem.wav', mimeType: 'audio/wav', buffer: makeWav(12_000) },
    { name: 'photo.png', mimeType: 'image/png', buffer: await makeImage(page, 400, 300) },
  ]);
  await expect(library(page).getByRole('listitem')).toHaveCount(2);
}

test('choose a song, set start point, volume and fades; undo; reload; delete', async ({ page }) => {
  await projectWithLibrary(page, 'Music test');
  await expect(songSlot(page)).toContainText('Empty');

  // The picker offers music only.
  await songSlot(page).getByRole('button', { name: 'Choose…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose song' });
  await expect(picker.getByRole('button', { name: 'photo.png' })).toHaveCount(0);
  await picker.getByRole('button', { name: 'anthem.wav' }).click();

  await expect(songSlot(page)).toContainText('anthem.wav');
  await expect(songSlot(page)).toContainText('Music · 0:12');
  await expect(library(page).getByRole('listitem', { name: 'anthem.wav' })).toContainText('Story music');
  await expect(music(page)).toContainText('0:00 of 0:12');
  await expect(music(page).getByLabel('Volume')).toHaveValue('100');
  await expect(music(page).getByLabel(/Fade in/)).not.toBeChecked();
  await expect(music(page).getByLabel(/Fade out/)).toBeChecked();
  await expect(music(page)).toContainText('Plays 0:00–0:09 of the song, for the whole story.');

  // Keyboard on the sliders changes the music, not the playhead.
  const playhead = await page.getByTestId('playhead-time').textContent();
  const start = music(page).getByLabel('Start the song at');
  await start.focus();
  await page.keyboard.press('End');
  await expect(music(page)).toContainText('0:11 of 0:12');
  await expect(music(page)).toContainText('The song ends 0:01 into the story; after that it’s silent.');
  await music(page).getByLabel('Volume').focus();
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(music(page).getByLabel('Volume')).toHaveValue('80');
  await expect(page.getByTestId('playhead-time')).toHaveText(playhead!);
  await music(page).getByLabel(/Fade in/).check();

  // Undo: fade in, then the whole volume run (one step), then the start point.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(music(page).getByLabel(/Fade in/)).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(music(page).getByLabel('Volume')).toHaveValue('100');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(music(page).getByLabel('Volume')).toHaveValue('80');

  // Persists.
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(songSlot(page)).toContainText('anthem.wav');
  await expect(music(page)).toContainText('0:11 of 0:12');
  await expect(music(page).getByLabel('Volume')).toHaveValue('80');

  // Deleting the song from the library removes the music.
  await library(page).getByRole('listitem', { name: 'anthem.wav' }).hover();
  await page.getByRole('button', { name: 'Delete anthem.wav' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete media?' })).toContainText('It’s the story’s music. The story will have no music.');
  await page.getByRole('dialog', { name: 'Delete media?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(songSlot(page)).toContainText('Empty');
  await expect(music(page).getByLabel('Volume')).toHaveCount(0);
});

test('a project saved before M6 (schema v1) opens, with its music track migrated', async ({ page }) => {
  await page.goto('/');
  const id = '9a3c1e4b-2f6d-4c8a-b1e7-5d0f2a9c7e31';
  // Write a raw v1 document straight into IndexedDB, as an older app version would have.
  await page.evaluate(async (id) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('recap-studio');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({
          id,
          schemaVersion: 1,
          name: 'From the old app',
          format: { width: 1080, height: 1920, fps: 30 },
          style: { paletteId: 'neon-pulse', fontPairId: 'heavy-grotesk' },
          scenes: [{ id: 's1', templateId: 'title', durationMs: 3000, fields: {}, transitionIn: 'fade' }],
          audio: { assetId: '2da05e70-8c65-4e2a-9f2d-4b9b9f3b2c33', offsetMs: 0, volume: 0.5 },
          createdAt: 1,
          updatedAt: 2,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'From the old app' })).toBeVisible();
  await page.getByRole('link', { name: 'Open From the old app' }).click();
  // The referenced song isn't in this browser's library: shown as missing, not a crash.
  await expect(songSlot(page)).toContainText('Missing media');
});

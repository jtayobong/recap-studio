import { expect, test, type Page } from '@playwright/test';
import { addBasicStory } from './helpers/story';
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
  await addBasicStory(page); // 8.5 s story
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'anthem.wav', mimeType: 'audio/wav', buffer: makeWav(12_000) },
    { name: 'photo.png', mimeType: 'image/png', buffer: await makeImage(page, 400, 300) },
  ]);
  await expect(library(page).getByRole('listitem')).toHaveCount(2);
}

test('the music can start with a later scene; deleting that scene starts it with the story again (M12.4)', async ({ page }) => {
  await projectWithLibrary(page, 'Music start scene');
  await songSlot(page).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose song' }).getByRole('button', { name: 'anthem.wav' }).click();

  const startsWith = music(page).getByLabel('Music starts with');
  await expect(startsWith.locator('option')).toHaveText(['Scene 1 · Title (story start)', 'Scene 2 · Big Number']);
  await expect(startsWith).toHaveValue('');
  await startsWith.selectOption({ label: 'Scene 2 · Big Number' });
  await expect(music(page)).toContainText('Silent until 0:04, then plays 0:00–0:05 of the song to the end of the story.');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(startsWith).toHaveValue('');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(music(page)).toContainText('Silent until 0:04');

  // Delete scene 2: the music starts with the story again.
  const chips = page.getByRole('list', { name: 'Scenes' }).getByRole('button');
  await chips.nth(1).click();
  await inspector(page).getByRole('button', { name: 'Delete' }).click();
  await page.keyboard.press('Escape');
  await expect(music(page).getByLabel('Music starts with')).toHaveValue('');
  await expect(music(page)).toContainText('for the whole story.');
});

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

  // With music, the export dialog shows the rights note.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(exportDialog).toContainText('Make sure you have the rights to use this music before sharing the video.');
  await expect(exportDialog).not.toContainText('This story has no music.');
  await exportDialog.getByRole('button', { name: 'Cancel' }).click();

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
  // Wait until the app has created its database (the empty state renders after the first query);
  // opening it ourselves earlier would create an empty database without the app's stores.
  await expect(page.getByRole('heading', { name: 'Make your first recap' })).toBeVisible();
  const id = '9a3c1e4b-2f6d-4c8a-b1e7-5d0f2a9c7e31';
  // Write a raw v1 document straight into IndexedDB, as an older app version would have.
  await page.evaluate(async (id) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('recap-studio');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try {
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
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }, id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'From the old app' })).toBeVisible();
  await page.getByRole('link', { name: 'Open From the old app' }).click();
  // The referenced song isn't in this browser's library: shown as missing, not a crash.
  await expect(songSlot(page)).toContainText('Missing media');
});

async function audioState(page: Page) {
  return page.getByTestId('preview-music').evaluate((el) => {
    const audio = el as HTMLAudioElement;
    return { paused: audio.paused, time: audio.currentTime, volume: audio.volume, muted: audio.muted };
  });
}

const playheadSeconds = async (page: Page) => {
  const text = (await page.getByTestId('playhead-time').textContent()) ?? '0:00.0';
  const [m, s] = text.split(':');
  return Number(m) * 60 + Number(s);
};

test('the preview plays the music in sync with the playhead; mute and the song end work', async ({ page }) => {
  await projectWithLibrary(page, 'Music preview');
  await songSlot(page).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose song' }).getByRole('button', { name: 'anthem.wav' }).click();
  await music(page).getByLabel('Start the song at').fill('2000');
  await music(page).getByLabel('Volume').fill('50');
  await expect(music(page)).toContainText('0:02 of 0:12');
  expect((await audioState(page)).paused).toBe(true);

  // Play: the song runs from 0:02 + playhead, at the chosen volume.
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(1200);
  let audio = await audioState(page);
  let playhead = await playheadSeconds(page);
  expect(audio.paused).toBe(false);
  expect(Math.abs(audio.time - (2 + playhead))).toBeLessThan(0.35);
  expect(audio.volume).toBeCloseTo(0.5, 2);

  // Pause stops it; seeking while paused and playing again resyncs.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(true);
  await page.getByLabel('Playhead').fill('5000');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(400);
  audio = await audioState(page);
  playhead = await playheadSeconds(page);
  expect(Math.abs(audio.time - (2 + playhead))).toBeLessThan(0.35);
  expect(playhead).toBeGreaterThan(5);

  // Mute (button, then the M key) silences without stopping.
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await audioState(page)).muted).toBe(true);
  expect((await audioState(page)).paused).toBe(false);
  await page.keyboard.press('m');
  await expect.poll(async () => (await audioState(page)).muted).toBe(false);
  await page.getByRole('button', { name: 'Pause' }).click();

  // A start point near the end: the song stops 1 s into the story while the preview keeps playing.
  await music(page).getByLabel('Start the song at').fill('11000');
  await expect(music(page)).toContainText('The song ends 0:01 into the story');
  await page.getByRole('button', { name: 'Go to start' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(400);
  expect((await audioState(page)).paused).toBe(false);
  await page.waitForTimeout(1300);
  expect(await playheadSeconds(page)).toBeGreaterThan(1.2);
  expect((await audioState(page)).paused).toBe(true);
});

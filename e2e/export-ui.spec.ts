import { expect, test, type Page } from '@playwright/test';
import { addBasicStory } from './helpers/story';
import { readFileSync } from 'node:fs';
import { makeImage } from './helpers/media';
import type * as DbExports from '../src/db/index';

test.setTimeout(120_000);

const exportStatus = (page: Page) => page.getByRole('status', { name: 'Export' });

async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
}

test('export from the editor: choose quality, watch progress, keep editing, download the file', async ({ page }, testInfo) => {
  await createProject(page, 'My 2026 Recap');
  // Nothing to export yet.
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await addBasicStory(page);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(dialog).toContainText('9:16 · 1080×1920 · 30 fps · 0:09');
  await expect(dialog.getByRole('radio', { name: /Standard/ })).toBeChecked();
  // No music: no rights note, and the dialog says so.
  await expect(dialog).toContainText('This story has no music.');
  await expect(dialog).not.toContainText('rights to use this music');
  await dialog.getByRole('radio', { name: /High/ }).check();
  await dialog.getByRole('button', { name: 'Start export' }).click();
  await expect(dialog).toBeHidden();

  // The editor stays usable while exporting: rename the project.
  await expect(exportStatus(page)).toContainText(/Exporting… \d+%|✓/);
  await page.getByLabel('Project name').fill('Renamed during export');
  await page.getByLabel('Project name').press('Enter');

  // The finished file keeps the name it had when the export started (a snapshot).
  await expect(exportStatus(page)).toContainText('✓ my-2026-recap.mp4', { timeout: 60_000 });
  const downloadPromise = page.waitForEvent('download');
  await exportStatus(page).getByRole('link', { name: 'Download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('my-2026-recap.mp4');
  const path = testInfo.outputPath('export.mp4');
  await download.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.length).toBeGreaterThan(100_000);
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp'); // an MP4

  await exportStatus(page).getByRole('button', { name: 'Dismiss export' }).click();
  await expect(exportStatus(page)).toBeEmpty();
  await expect(page.getByLabel('Project name')).toHaveValue('Renamed during export');
});

test('a running export can be cancelled', async ({ page }) => {
  await createProject(page, 'Long story');
  // Three 60 s scenes: long enough that the export is still running when we click Cancel.
  await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts' as string)) as typeof DbExports;
    const registry = await import('/src/render/templates/registry.ts' as string);
    const id = location.pathname.split('/').pop()!;
    const project = (await db.projectRepository.get(id))!;
    const scenes = ['title', 'big-number', 'title'].map((t) => ({ ...registry.createScene(t), durationMs: 60_000 }));
    await db.projectRepository.save({ ...project, scenes });
  });
  await page.reload();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export video' }).getByRole('button', { name: 'Start export' }).click();
  await expect(exportStatus(page)).toContainText(/Exporting… \d+%/);
  await exportStatus(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(exportStatus(page)).toHaveText('Export cancelled.');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});

test('the export dialog warns about scenes whose media was deleted', async ({ page }) => {
  await createProject(page, 'Missing media');
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'gone.png', mimeType: 'image/png', buffer: await makeImage(page, 400, 300) },
  ]);
  await page.getByRole('button', { name: /Photo \/ Video/ }).click();
  await page.getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo or clip' }).getByRole('button', { name: 'gone.png' }).click();

  // Delete the photo, then undo the slot clearing: the scene points at media that's gone.
  await page.getByRole('listitem', { name: 'gone.png' }).hover();
  await page.getByRole('button', { name: 'Delete gone.png' }).click();
  await page.getByRole('dialog', { name: 'Delete media?' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export video' })).toContainText(
    '1 scene uses media that is no longer in the library. It will show an empty placeholder in the video.',
  );
});

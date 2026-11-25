import { expect, test, type Page } from '@playwright/test';
import { addBasicStory } from './helpers/story';
import { readFileSync } from 'node:fs';
import { makeImage } from './helpers/media';

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
  // Escape closes the dialog (a user close is still reported after the Modal close-event fix).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Export video' })).toBeHidden();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export video' })).toBeVisible();
});

test('leaving the editor asks first while an export is running or not yet downloaded', async ({ page }) => {
  await createProject(page, 'Leave guard');
  await addBasicStory(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export video' }).getByRole('button', { name: 'Start export' }).click();
  await expect(exportStatus(page)).toContainText('✓ leave-guard.mp4', { timeout: 60_000 });

  // Not downloaded yet: leaving asks; staying keeps the file.
  await page.getByRole('link', { name: '← Projects' }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave the editor?' });
  await expect(confirm).toContainText('hasn’t been downloaded yet');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/project\//);
  await expect(exportStatus(page)).toContainText('✓ leave-guard.mp4');

  // The browser's Back button is guarded too.
  await page.goBack();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/project\//);

  // After downloading, leaving doesn't ask.
  const download = page.waitForEvent('download');
  await exportStatus(page).getByRole('link', { name: 'Download' }).click();
  await download;
  await page.getByRole('link', { name: '← Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
});

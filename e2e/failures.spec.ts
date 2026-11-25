import { expect, test, type Page } from '@playwright/test';
import { makeImage } from './helpers/media';

/**
 * M8 done-when, failure paths: each ends in a clear, actionable message (all UI-only, so they also
 * run against the production build). Unsupported and missing files, storage-full warnings and the
 * delete flows are covered in media-library.spec.ts, storage.spec.ts and export-ui.spec.ts.
 */

async function newProject(page: Page, name = 'Failure test') {
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\//);
}

test('a browser without local storage support is told what to use instead', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, 'getDirectory', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "This browser can't run Recap Studio" })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('recent desktop version of Chrome or Edge');
});

test('a browser that can’t encode video can still edit, and is told why it can’t export', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { VideoEncoder?: unknown }).VideoEncoder;
    delete (window as { AudioEncoder?: unknown }).AudioEncoder;
  });
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: "this browser can't export video" })).toBeVisible();

  await newProject(page);
  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Fitness year/ }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(dialog.getByRole('alert')).toContainText('This browser can’t encode video, so it can’t export');
  await expect(dialog.getByRole('button', { name: 'Start export' })).toBeDisabled();
});

test('importing when storage is full explains what to do and stores nothing', async ({ page }) => {
  // Only ~10 MB free: less than a file plus the safety margin.
  await page.addInitScript(() => {
    const GB = 1024 ** 3;
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ usage: 10 * GB - 10 * 1024 ** 2, quota: 10 * GB }) });
  });
  await page.goto('/');
  await newProject(page);
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'big.png', mimeType: 'image/png', buffer: await makeImage(page, 1200, 900) },
  ]);
  const panel = page.getByRole('region', { name: 'Media' });
  await expect(panel.getByRole('alert').filter({ hasText: 'Not enough storage space' })).toContainText(
    'Free up disk space or delete unused media, then try again.',
  );
  await expect(panel.getByText('No media yet.')).toBeVisible();
});

test('a running export can be cancelled, and leaving during an export asks first', async ({ page }) => {
  await page.goto('/');
  await newProject(page, 'Cancel me');
  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Travel year/ }).click();
  const status = page.getByRole('status', { name: 'Export' });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export video' }).getByRole('button', { name: 'Start export' }).click();
  await expect(status).toContainText(/Exporting… \d+%/);
  await status.getByRole('button', { name: 'Cancel' }).click();
  await expect(status).toHaveText('Export cancelled.');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export video' }).getByRole('button', { name: 'Start export' }).click();
  await expect(status).toContainText(/Exporting… \d+%/);
  await page.getByRole('link', { name: '← Projects' }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave the editor?' });
  await expect(confirm).toContainText('An export is still running. Leaving the editor cancels it.');
  await confirm.getByRole('button', { name: 'Leave and cancel export' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { makeImage } from './helpers/media';

const rows = (page: Page) => page.getByRole('table', { name: 'Media by size' }).getByRole('row');

async function projectWithMedia(page: Page, name: string, files: { name: string; buffer: Buffer }[]) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\//);
  await page.getByLabel('Import media files').setInputFiles(files.map((f) => ({ ...f, mimeType: 'image/png' })));
  await expect(page.getByRole('list', { name: 'Media library' }).getByRole('listitem')).toHaveCount(files.length);
}

test('the Storage page shows what takes space and cleans up unused and used media', async ({ page }) => {
  await page.goto('/');
  const big = await makeImage(page, 2000, 2000);
  const small = await makeImage(page, 200, 200);
  await projectWithMedia(page, 'Trip', [
    { name: 'big.png', buffer: big },
    { name: 'small.png', buffer: small },
  ]);
  // Use big.png in a scene; small.png stays unused.
  await page.getByRole('button', { name: /Photo \/ Video/ }).click();
  await page.getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo or clip' }).getByRole('button', { name: 'big.png' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.getByRole('link', { name: '← Projects' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Storage' }).click();
  await expect(page.getByRole('heading', { name: 'Storage', level: 1 })).toBeVisible();

  // Largest first, with status.
  await expect(rows(page)).toHaveCount(3); // header + 2
  await expect(rows(page).nth(1)).toContainText('big.png');
  await expect(rows(page).nth(1)).toContainText('In use');
  await expect(rows(page).nth(2)).toContainText('small.png');
  await expect(rows(page).nth(2)).toContainText('Unused');

  // Delete unused media.
  await page.getByRole('button', { name: /Delete unused media \(1,/ }).click();
  await page.getByRole('dialog', { name: 'Delete unused media?' }).getByRole('button', { name: 'Delete unused media' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted 1 unused item' })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);

  // Delete media that is in use: the scene's slot is emptied.
  await page.getByRole('button', { name: 'Delete big.png' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete media?' });
  await expect(confirm).toContainText('It’s used in “Trip”');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No media stored yet.')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('link', { name: 'Open Trip' }).click();
  await page.getByRole('list', { name: 'Scenes' }).getByRole('button').first().click();
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('group', { name: 'Photo or clip' })).toContainText('Empty');
});

test('a warning appears on the Projects page and in the editor when storage is almost full', async ({ page }) => {
  // Pretend the browser has only ~0.5 GB left for this app.
  await page.addInitScript(() => {
    const GB = 1024 ** 3;
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ usage: 9.5 * GB, quota: 10 * GB }) });
  });
  await page.goto('/');
  const warning = page.getByRole('alert').filter({ hasText: 'Storage is almost full' });
  await expect(warning).toContainText('512 MB left');
  await expect(warning.getByRole('link', { name: 'Free up space' })).toHaveAttribute('href', '/storage');

  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('region', { name: 'Media' }).getByRole('alert')).toContainText('Storage is almost full');
});

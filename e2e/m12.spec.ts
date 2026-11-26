import { expect, test, type Page } from '@playwright/test';
import { makeImage } from './helpers/media';

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const library = (page: Page) => page.getByRole('list', { name: 'Media library' });
const slot = (page: Page, n: number) => inspector(page).getByRole('group', { name: `Photo ${n}`, exact: true });

async function carouselWithPhotos(page: Page, count: number) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  const files = [];
  for (let i = 1; i <= count; i += 1) {
    files.push({ name: `p${String(i).padStart(2, '0')}.png`, mimeType: 'image/png', buffer: await makeImage(page, 400 + i * 10, 300) });
  }
  await page.getByLabel('Import media files').setInputFiles(files);
  await expect(library(page).getByRole('listitem')).toHaveCount(count);
  await page.getByRole('button', { name: /Photo carousel/ }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 1 · Photo carousel' })).toBeVisible();
}

test('Add photos… fills the carousel in pick order, as one undo step', async ({ page }) => {
  await carouselWithPhotos(page, 3);
  await expect(inspector(page)).toContainText('Add photos or clips to fill the strip.');

  await inspector(page).getByRole('button', { name: 'Add photos…' }).click();
  const picker = page.getByRole('dialog', { name: 'Add photos and clips' });
  await expect(picker.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await picker.getByRole('button', { name: 'p03.png' }).click();
  await picker.getByRole('button', { name: 'p01.png' }).click();
  await expect(picker.getByRole('button', { name: 'p03.png' })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Add 2' }).click();
  await expect(picker).toBeHidden();

  await expect(slot(page, 1)).toContainText('p03.png');
  await expect(slot(page, 2)).toContainText('p01.png');
  await expect(slot(page, 3)).toContainText('Empty');
  await expect(inspector(page)).toContainText('2 photos and clips · about 3.0 s each');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(slot(page, 1)).toContainText('Empty');
  await expect(slot(page, 2)).toBeHidden();
});

test('the carousel takes 12 photos, then Add photos… is disabled', async ({ page }) => {
  await carouselWithPhotos(page, 13);
  await inspector(page).getByRole('button', { name: 'Add photos…' }).click();
  const picker = page.getByRole('dialog', { name: 'Add photos and clips' });
  for (let i = 1; i <= 13; i += 1) await picker.getByRole('button', { name: `p${String(i).padStart(2, '0')}.png` }).click();
  await expect(picker).toContainText('Only the first 12 will be added.');
  await picker.getByRole('button', { name: 'Add 12' }).click();

  await expect(slot(page, 12)).toContainText('p12.png');
  await expect(inspector(page)).toContainText('12 photos and clips · about 0.5 s each');
  await expect(inspector(page)).toContainText('1 didn’t fit: the carousel holds 12.');
  await expect(inspector(page).getByRole('button', { name: 'Add photos…' })).toBeDisabled();
});

test('carousel Movement and Photo fit options are in the inspector', async ({ page }) => {
  await carouselWithPhotos(page, 1);
  await expect(inspector(page).getByLabel('Movement')).toHaveValue('glide');
  await inspector(page).getByLabel('Movement').selectOption({ label: 'Stop at each photo' });
  await expect(inspector(page).getByLabel('Photo fit')).toHaveValue('cover');
  await inspector(page).getByLabel('Photo fit').selectOption({ label: 'Show whole photo' });
  await expect(inspector(page).getByLabel('Photo fit')).toHaveValue('contain');
});

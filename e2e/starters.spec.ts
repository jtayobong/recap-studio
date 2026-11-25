import { expect, test, type Page } from '@playwright/test';

const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

test('an empty project offers starter stories; picking one fills the story and is saved', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);

  const starters = page.getByRole('list', { name: 'Starter stories' });
  await expect(starters.getByRole('button')).toHaveText([/Music year/, /Travel year/, /Fitness year/]);
  await starters.getByRole('button', { name: /Travel year/ }).click();

  await expect(chips(page)).toHaveCount(7);
  await expect(chips(page)).toHaveText([/Title/, /Big Number/, /Photo carousel/, /Top 5/, /Compare/, /Photo grid/, /Outro/]);
  await expect(page.getByRole('list', { name: 'Starter stories' })).toHaveCount(0);

  // Placeholder text is ready to edit.
  await chips(page).nth(3).click();
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByLabel('#1')).toHaveValue('Lisbon');

  // Saved.
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(chips(page)).toHaveCount(7);
});

test('undo right after picking a starter returns to the empty story', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Music year/ }).click();
  await expect(chips(page)).toHaveCount(7);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(chips(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Starter stories' })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
}

test('text carousel: add it, fill cards (the next card appears), switch direction; saved', async ({ page }) => {
  await createProject(page);
  await page.getByRole('button', { name: /\+ Text carousel/ }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 1 · Text carousel' })).toBeVisible();

  // Three sample cards, plus the next empty one.
  await expect(inspector(page).getByLabel('Card 1 headline')).toHaveValue('Lisbon');
  await expect(inspector(page).getByLabel('Card 4 headline')).toBeVisible();
  await expect(inspector(page).getByLabel('Card 5 headline')).toHaveCount(0);
  await inspector(page).getByLabel('Card 4 headline').fill('Kyoto');
  await inspector(page).getByLabel('Card 4 small line').fill('Cherry blossom week');
  await expect(inspector(page).getByLabel('Card 5 headline')).toBeVisible();
  await inspector(page).getByLabel('Direction').selectOption('up');

  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await chips(page).first().click();
  await expect(inspector(page).getByLabel('Card 4 headline')).toHaveValue('Kyoto');
  await expect(inspector(page).getByLabel('Direction')).toHaveValue('up');
});

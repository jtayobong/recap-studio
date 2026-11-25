import { expect, test, type Page } from '@playwright/test';

// Every test gets a fresh browser context, so IndexedDB starts empty.

async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
}

test('shows the empty state on first run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make your first recap' })).toBeVisible();
});

test('create, reload, rename, duplicate and delete a project', async ({ page }) => {
  await createProject(page, 'My 2026 Recap');

  // Back to the list; it survives a full reload.
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My 2026 Recap' })).toBeVisible();

  // Rename inline.
  await page.getByRole('button', { name: 'Rename My 2026 Recap' }).click();
  await page.getByLabel('New project name').fill('Best Of 2026');
  await page.getByLabel('New project name').press('Enter');
  await expect(page.getByRole('heading', { name: 'Best Of 2026' })).toBeVisible();

  // Duplicate.
  await page.getByRole('button', { name: 'Duplicate Best Of 2026' }).click();
  await expect(page.getByRole('heading', { name: 'Best Of 2026 (copy)' })).toBeVisible();

  // Delete the copy, with confirmation.
  await page.getByRole('button', { name: 'Delete Best Of 2026 (copy)' }).click();
  await page.getByRole('dialog', { name: 'Delete project?' }).getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('heading', { name: 'Best Of 2026 (copy)' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Best Of 2026', exact: true })).toBeVisible();
});

test('editor changes autosave and survive a reload', async ({ page }) => {
  await createProject(page, 'Autosave Test');

  const nameField = page.getByLabel('Project name');
  await nameField.fill('Renamed In Editor');
  await nameField.press('Enter');

  await page.getByText('Citrus Pop').click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('Renamed In Editor');
  await expect(page.getByRole('radio', { name: 'Citrus Pop' })).toBeChecked();
});

test('unknown project ids show a friendly message', async ({ page }) => {
  await page.goto('/project/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible();
});

test('system page reports browser support', async ({ page }) => {
  await page.goto('/system');
  await expect(page.getByRole('heading', { name: 'Browser support' })).toBeVisible();
  await expect(page.getByText('IndexedDB')).toBeVisible();
});

test('the story font can be chosen and is saved', async ({ page }) => {
  await createProject(page, 'Font Test');
  await expect(page.getByRole('radio', { name: 'Heavy Grotesk' })).toBeChecked();
  await page.getByText('Editorial Serif').click();
  await expect(page.getByRole('radio', { name: 'Editorial Serif' })).toBeChecked();
  await page.getByText('Electric Night').click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Editorial Serif' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Electric Night' })).toBeChecked();
  // Undo goes back to the previous font.
  await page.getByText('Typewriter Mono').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('radio', { name: 'Editorial Serif' })).toBeChecked();
});

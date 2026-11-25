import { expect, test, type Page } from '@playwright/test';

async function openStarterProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Editor Test');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Add starter scenes' }).click();
}

const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'All changes saved' });

test('edit scene content and timing, and it persists', async ({ page }) => {
  await openStarterProject(page);

  await chips(page).filter({ hasText: 'Big Number' }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 2 · Big Number' })).toBeVisible();

  await inspector(page).getByLabel('Label').fill('Songs played');
  await inspector(page).getByLabel('Number', { exact: true }).fill('1200');
  await inspector(page).getByLabel('Count up').uncheck();
  await inspector(page).getByLabel('Duration (seconds)').fill('4');
  await inspector(page).getByLabel('Transition in').selectOption('fade');

  await expect(page.getByText('2 scenes · 0:07.5')).toBeVisible();
  await expect(saved(page)).toBeVisible();

  await page.reload();
  await chips(page).filter({ hasText: 'Big Number' }).click();
  await expect(inspector(page).getByLabel('Label')).toHaveValue('Songs played');
  await expect(inspector(page).getByLabel('Number', { exact: true })).toHaveValue('1200');
  await expect(inspector(page).getByLabel('Count up')).not.toBeChecked();
  await expect(inspector(page).getByLabel('Transition in')).toHaveValue('fade');
});

test('duplicate, reorder and delete scenes', async ({ page }) => {
  await openStarterProject(page);

  await chips(page).filter({ hasText: 'Title' }).click();
  await inspector(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(chips(page)).toHaveCount(3);
  await expect(inspector(page).getByRole('heading', { name: 'Scene 2 · Title' })).toBeVisible();

  await inspector(page).getByRole('button', { name: 'Move later →' }).click();
  await expect(chips(page).nth(2)).toContainText('Title');
  await expect(chips(page).nth(1)).toContainText('Big Number');

  // Keyboard: Alt+← moves the focused chip earlier; Delete removes it.
  await chips(page).nth(2).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(chips(page).nth(1)).toContainText('Title');
  await chips(page).nth(1).focus();
  await page.keyboard.press('Delete');
  await expect(chips(page)).toHaveCount(2);

  // Drag the Big Number scene in front of the Title.
  await chips(page).nth(1).dragTo(chips(page).nth(0), { targetPosition: { x: 5, y: 20 } });
  await expect(chips(page).nth(0)).toContainText('Big Number');
});

test('undo and redo, with typing grouped into one step', async ({ page }) => {
  await openStarterProject(page);
  await chips(page).filter({ hasText: 'Title' }).click();

  const kicker = inspector(page).getByLabel('Kicker');
  await kicker.fill('');
  await page.waitForTimeout(1100); // longer than the 1 s grouping window: clearing is its own step
  await kicker.pressSequentially('Hello there', { delay: 20 });
  await kicker.blur();

  await page.getByRole('button', { name: '↶ Undo' }).click();
  await expect(kicker).toHaveValue('');
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await expect(kicker).toHaveValue('Your year, replayed');

  // Keyboard redo outside a text field.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+Shift+Z');
  await expect(kicker).toHaveValue('');
  await page.getByRole('button', { name: '↷ Redo' }).click();
  await expect(kicker).toHaveValue('Hello there');
});

test('adding a scene inserts it after the selected one', async ({ page }) => {
  await openStarterProject(page);
  await chips(page).filter({ hasText: 'Title' }).click();
  await page.getByRole('button', { name: /\+ Big Number/ }).click();
  await expect(chips(page)).toHaveCount(3);
  await expect(chips(page).nth(1)).toContainText('Big Number');
  await expect(chips(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
});

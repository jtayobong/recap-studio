import { expect, test, type Page } from '@playwright/test';

const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');
const preview = (page: Page) => page.getByTestId('preview-canvas');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function canvasSize(page: Page) {
  return preview(page).evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
}

test('a 16:9 project: create, preview, thumbnails, switch format and undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Wide recap');
  // The radios are visually hidden inside their cards: click the card, as a user would.
  await dialog.locator('label', { hasText: 'Landscape' }).click();
  await expect(dialog.getByRole('radio', { name: /Landscape/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /Square/ })).toBeDisabled(); // still "Later"
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);

  // The preview is a wide 1920×1080 canvas, shown wider than tall.
  expect(await canvasSize(page)).toEqual({ width: 1920, height: 1080 });
  const box = (await preview(page).boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 1);

  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Travel year/ }).click();
  await expect(chips(page)).toHaveCount(7);
  // Strip thumbnails are 16:9 too.
  const thumb = (await chips(page).first().locator('canvas').boundingBox())!;
  expect(thumb.width / thumb.height).toBeCloseTo(16 / 9, 1);

  // The project panel shows the format; switching to 9:16 is one undo step.
  await page.keyboard.press('Escape');
  const format = inspector(page).getByRole('group', { name: 'Format' });
  await expect(format.getByRole('radio', { name: /Landscape/ })).toBeChecked();
  await expect(format.getByRole('radio', { name: /Square/ })).toHaveCount(0); // only choosable formats
  await format.locator('label', { hasText: 'Story' }).click();
  await expect.poll(() => canvasSize(page)).toEqual({ width: 1080, height: 1920 });
  await expect(inspector(page)).toContainText('9:16 · 1080×1920');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => canvasSize(page)).toEqual({ width: 1920, height: 1080 });
  await expect(format.getByRole('radio', { name: /Landscape/ })).toBeChecked();
  await expect(chips(page)).toHaveCount(7); // scenes untouched

  // Saved as 16:9.
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  expect(await canvasSize(page)).toEqual({ width: 1920, height: 1080 });
});

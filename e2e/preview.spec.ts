import { expect, test, type Page } from '@playwright/test';

async function openNewProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Preview Test');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\//);
}

/** Number of distinct colours in a coarse grid of canvas samples. 1 means a blank canvas. */
async function distinctColors(page: Page): Promise<number> {
  return page.getByTestId('preview-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const colors = new Set<string>();
    for (let x = 0.05; x < 1; x += 0.1) {
      for (let y = 0.05; y < 1; y += 0.1) {
        const [r, g, b] = ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
        colors.add(`${r},${g},${b}`);
      }
    }
    return colors.size;
  });
}

const playhead = (page: Page) => page.getByTestId('playhead-time');

test('starter scenes render, play, seek and persist', async ({ page }) => {
  await openNewProject(page);

  // Empty story: placeholder card plus the starter button.
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add starter scenes' }).click();

  const scenes = page.getByRole('list', { name: 'Scenes' });
  await expect(scenes.getByRole('button')).toHaveCount(2);
  await expect(scenes.getByRole('button').nth(0)).toContainText('Title');
  await expect(scenes.getByRole('button').nth(1)).toContainText('Big Number');
  await expect(page.getByText('/ 0:08.5')).toBeVisible();

  // Selecting the big number scene jumps to its poster frame (3.5 s + 2.4 s).
  await scenes.getByRole('button', { name: /Big Number/ }).click();
  await expect(playhead(page)).toHaveText('0:05.9');
  await expect(scenes.getByRole('button', { name: /Big Number/ })).toHaveAttribute('aria-current', 'step');
  await expect.poll(() => distinctColors(page)).toBeGreaterThan(2);

  // Play advances the playhead; pause stops it.
  await page.getByRole('button', { name: 'Go to start' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(playhead(page)).not.toHaveText('0:00.0');
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await playhead(page).textContent();
  await page.waitForTimeout(300);
  await expect(playhead(page)).toHaveText(paused ?? '');

  // Keyboard shortcuts (focus the page body first, not a button).
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('End');
  await expect(playhead(page)).toHaveText('0:08.5');
  await page.keyboard.press('Home');
  await expect(playhead(page)).toHaveText('0:00.0');

  // Scenes were saved with the project.
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('button')).toHaveCount(2);
});

test('playback stops at the end of the story', async ({ page }) => {
  await openNewProject(page);
  await page.getByRole('button', { name: '+ Title' }).click(); // a single 3.5 s scene
  await page.getByRole('button', { name: 'Go to start' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(playhead(page)).toHaveText('0:03.5', { timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

import { expect, type Page } from '@playwright/test';

/**
 * Adds the minimal two-scene story (Title 3.5 s + Big Number 5 s = 8.5 s, each with its default
 * transition) to the open, empty project through the UI, then deselects and rewinds, so tests start
 * from the project panel at 0:00. Works against the dev server and the production build.
 */
export async function addBasicStory(page: Page): Promise<void> {
  // The editor has loaded the (empty) project once the starter picker shows.
  await expect(page.getByRole('list', { name: 'Starter stories' })).toBeVisible();
  // Gallery buttons are named "+ Title An opening card…", so match the start of the name.
  await page.getByRole('button', { name: /^\+ Title / }).click();
  await page.getByRole('button', { name: /^\+ Big Number / }).click();
  const chips = page.getByRole('list', { name: 'Scenes' }).getByRole('button');
  await expect(chips).toHaveCount(2);
  await page.keyboard.press('Escape'); // back to the project panel
  await page.getByRole('button', { name: 'Go to start' }).click();
}

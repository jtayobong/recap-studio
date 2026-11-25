import { expect, test, type Page } from '@playwright/test';
import { makeImage, makeWebm } from './helpers/media';

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const slot = (page: Page) => inspector(page).getByRole('group', { name: 'Photo or clip' });
const library = (page: Page) => page.getByRole('list', { name: 'Media library' });
const tile = (page: Page, name: string) => library(page).getByRole('listitem', { name });
const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

async function projectWithMedia(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await page.getByLabel('Import media files').setInputFiles([
    { name: 'beach.png', mimeType: 'image/png', buffer: await makeImage(page, 800, 600) },
    { name: 'clip.webm', mimeType: 'video/webm', buffer: await makeWebm(page, 800) },
  ]);
  await expect(library(page).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: /Photo \/ Video/ }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 1 · Photo / Video' })).toBeVisible();
}

test('choose, undo, clear and replace media in a scene', async ({ page }) => {
  await projectWithMedia(page);
  await expect(slot(page)).toContainText('Empty');

  // Keyboard-friendly path: the picker dialog.
  await slot(page).getByRole('button', { name: 'Choose…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose photo or clip' });
  await picker.getByRole('button', { name: 'beach.png' }).click();
  await expect(picker).toBeHidden();
  await expect(slot(page)).toContainText('beach.png');
  await expect(slot(page)).toContainText('Photo · 800×600');
  await expect(tile(page, 'beach.png')).toContainText('In 1 scene');

  // Placing media is undoable.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(slot(page)).toContainText('Empty');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(slot(page)).toContainText('beach.png');

  // The picker marks the current choice.
  await slot(page).getByRole('button', { name: 'Replace…' }).click();
  await expect(picker.getByRole('button', { name: 'beach.png' })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Cancel' }).click();

  await slot(page).getByRole('button', { name: 'Clear' }).click();
  await expect(slot(page)).toContainText('Empty');
  await expect(tile(page, 'beach.png')).toContainText('Not used');
});

test('drag a library tile onto the slot, and it persists', async ({ page }) => {
  await projectWithMedia(page);

  await tile(page, 'clip.webm').dragTo(page.getByTestId('media-slot'));
  await expect(slot(page)).toContainText('clip.webm');
  await expect(slot(page)).toContainText(/Video · 180×320 · 0:01/);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.reload();
  await chips(page).first().click();
  await expect(slot(page)).toContainText('clip.webm');
});

test('dropping a file from the computer imports it and fills the slot', async ({ page }) => {
  await projectWithMedia(page);
  const png = await makeImage(page, 300, 300);
  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'from-desktop.png', { type: 'image/png' }));
    return transfer;
  }, [...png]);
  const target = page.getByTestId('media-slot');
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });

  await expect(slot(page)).toContainText('from-desktop.png');
  await expect(tile(page, 'from-desktop.png')).toContainText('In 1 scene');
});

test('deleting media that a scene uses empties the slot', async ({ page }) => {
  await projectWithMedia(page);
  await slot(page).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo or clip' }).getByRole('button', { name: 'beach.png' }).click();

  await tile(page, 'beach.png').hover();
  await page.getByRole('button', { name: 'Delete beach.png' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete media?' });
  await expect(dialog).toContainText('It’s used in 1 scene.');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(tile(page, 'beach.png')).toHaveCount(0);
  await expect(slot(page)).toContainText('Empty');
});

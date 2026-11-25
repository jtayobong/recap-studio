import { expect, test, type Page } from '@playwright/test';

/**
 * The M4 "done when", end to end through the UI: import a photo, use it in a scene, see it in
 * the preview and thumbnail, reload, duplicate the project (the copy gets its own files), and
 * delete projects without leaving orphaned files behind.
 */

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const library = (page: Page) => page.getByRole('list', { name: 'Media library' });
const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

async function greenPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1200, 800);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 1200, 800);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

async function isGreen(page: Page, selector: string, fx: number, fy: number): Promise<boolean> {
  return page.evaluate(
    ({ selector, fx, fy }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(selector);
      if (!canvas) return false;
      const [r, g, b] = canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1).data;
      return g! > 180 && r! < 80 && b! < 80;
    },
    { selector, fx, fy },
  );
}

/** Everything stored for media: OPFS files and asset rows (read straight from storage). */
async function storedMedia(page: Page): Promise<{ files: string[]; rows: number }> {
  return page.evaluate(async () => {
    const files: string[] = [];
    const root = await navigator.storage.getDirectory();
    for (const dir of ['assets', 'thumbs']) {
      try {
        const handle = await root.getDirectoryHandle(dir);
        for await (const name of handle.keys()) files.push(`${dir}/${name}`);
      } catch {
        /* never created */
      }
    }
    const rows = await new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('recap-studio');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const count = db.transaction('assets').objectStore('assets').count();
        count.onsuccess = () => {
          resolve(count.result);
          db.close();
        };
      };
    });
    return { files: files.sort(), rows };
  });
}

test('media survives a reload, duplicates with its project and is deleted with it', async ({ page }) => {
  await page.goto('/');
  const png = await greenPng(page);

  // Create, import, place.
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Summer');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.getByLabel('Import media files').setInputFiles([{ name: 'meadow.png', mimeType: 'image/png', buffer: png }]);
  await expect(library(page).getByRole('listitem', { name: 'meadow.png' })).toBeVisible();
  await page.getByRole('button', { name: /Photo \/ Video/ }).click();
  await inspector(page).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('dialog', { name: 'Choose photo or clip' }).getByRole('button', { name: 'meadow.png' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  expect(await storedMedia(page)).toMatchObject({ rows: 1 });
  expect((await storedMedia(page)).files).toHaveLength(2); // binary + thumbnail

  // Reload: still in the library, the scene, the preview and the strip thumbnail.
  await page.reload();
  await expect(library(page).getByRole('listitem', { name: 'meadow.png' })).toContainText('In 1 scene');
  await expect.poll(() => isGreen(page, 'canvas.scene-thumb', 0.5, 0.3)).toBe(true);
  await chips(page).first().click();
  await expect(inspector(page)).toContainText('meadow.png');
  await expect.poll(() => isGreen(page, '[data-testid="preview-canvas"]', 0.5, 0.3)).toBe(true);

  // Duplicate: the copy owns separate files.
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'Duplicate Summer' }).click();
  await expect(page.getByRole('heading', { name: 'Summer (copy)' })).toBeVisible();
  await expect.poll(async () => (await storedMedia(page)).rows).toBe(2);
  expect((await storedMedia(page)).files).toHaveLength(4);

  // Delete the original: its files go, the copy keeps working.
  await page.getByRole('button', { name: 'Delete Summer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete project?' }).getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('heading', { name: 'Summer', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await storedMedia(page)).rows).toBe(1);
  expect((await storedMedia(page)).files).toHaveLength(2);

  await page.getByRole('link', { name: 'Open Summer (copy)' }).click();
  await expect(library(page).getByRole('listitem', { name: 'meadow.png' })).toContainText('In 1 scene');
  await chips(page).first().click();
  await expect.poll(() => isGreen(page, '[data-testid="preview-canvas"]', 0.5, 0.3)).toBe(true);

  // Delete the copy too: nothing is left behind.
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'Delete Summer (copy)' }).click();
  await page.getByRole('dialog', { name: 'Delete project?' }).getByRole('button', { name: 'Delete project' }).click();
  await expect.poll(() => storedMedia(page)).toEqual({ files: [], rows: 0 });
});

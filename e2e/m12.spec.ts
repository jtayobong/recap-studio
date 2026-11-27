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

test('photo grid Slow zoom can be turned off (M12.1)', async ({ page }) => {
  await carouselWithPhotos(page, 1);
  await page.getByRole('button', { name: /Photo grid/ }).click();
  await expect(inspector(page).getByRole('heading', { name: /Photo grid/ })).toBeVisible();
  const zoom = inspector(page).getByLabel('Slow zoom');
  await expect(zoom).toBeChecked();
  await zoom.uncheck();
  await expect(zoom).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(zoom).toBeChecked();
});

test('carousel Movement and Photo fit options are in the inspector', async ({ page }) => {
  await carouselWithPhotos(page, 1);
  await expect(inspector(page).getByLabel('Movement')).toHaveValue('glide');
  await inspector(page).getByLabel('Movement').selectOption({ label: 'Stop at each photo' });
  await expect(inspector(page).getByLabel('Photo fit')).toHaveValue('cover');
  await inspector(page).getByLabel('Photo fit').selectOption({ label: 'Show whole photo' });
  await expect(inspector(page).getByLabel('Photo fit')).toHaveValue('contain');
});

test('fiesta: new palettes are offered, and the Shapes choice is saved (M12.3)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByText('Parol Night').click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await expect(page.getByRole('radio', { name: 'Parol Night' })).toBeChecked();

  const shapes = page.getByRole('group', { name: 'Background shapes' });
  await expect(shapes.getByRole('radio', { name: 'Geometric' })).toBeChecked();
  await shapes.getByText('Fiesta').click();
  await expect(shapes.getByRole('radio', { name: 'Fiesta' })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Background shapes' }).getByRole('radio', { name: 'Fiesta' })).toBeChecked();

  // With motion off there are no shapes to pick.
  await page.getByRole('group', { name: 'Background motion' }).getByText('Off').click();
  await expect(page.getByRole('group', { name: 'Background shapes' }).getByRole('radio', { name: 'Fiesta' })).toBeDisabled();
});

test('export: fiesta shapes match the preview frame for frame, in both shapes (M12.3)', { tag: '@dev' }, async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/system');
  const reports = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const db = await load('/src/db/index.ts');
    const exporter = await load('/src/export/exportStory.ts');
    const inspect = await load('/src/export/testing/inspectExport.ts');
    const registry = await load('/src/render/templates/registry.ts');
    const project = await db.projectRepository.create({ name: 'M12.3 export', paletteId: 'banderitas' });
    const scenes = [registry.createScene('section'), registry.createScene('big-number')].map((s) => ({ ...s, durationMs: 3000, transitionIn: 'cut' as const }));
    const out: Record<string, unknown> = {};
    for (const [shape, width, height] of [['portrait', 1080, 1920], ['landscape', 1920, 1080]] as const) {
      const style = { ...project.style, backgroundMotion: 'lively', backgroundShapes: 'fiesta' };
      const saved = await db.projectRepository.save({ ...project, style, format: { ...project.format, width, height }, scenes });
      const file = await exporter.exportStory(saved, db.assetRepository);
      out[shape] = await inspect.inspectExport(file.blob, saved, [400, 1800, 3300, 5200]);
    }
    return out as Record<string, { frameDiffs: { timeMs: number; meanAbsDiff: number; badPixelShare: number }[] }>;
  });
  for (const [shape, report] of Object.entries(reports)) {
    for (const diff of report.frameDiffs) {
      expect(diff.meanAbsDiff, `${shape} at ${diff.timeMs} ms`).toBeLessThan(4);
      expect(diff.badPixelShare, `${shape} at ${diff.timeMs} ms`).toBeLessThan(0.005);
    }
  }
});

test('Encore scene: "One more thing…" with an optional reveal, black stage or story colours (M12.5)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await page.getByRole('button', { name: /^\+ Encore / }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 1 · Encore' })).toBeVisible();
  await expect(inspector(page).getByLabel('Look')).toHaveValue('stage');
  await expect(inspector(page).getByLabel('First line')).toHaveValue('One more thing…');
  await expect(inspector(page).getByLabel('Reveal (optional)')).toHaveValue('See you in 2027');
  await inspector(page).getByLabel('Reveal (optional)').fill('We got a dog');
  await inspector(page).getByLabel('Look').selectOption({ label: 'Story colours' });
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('list', { name: 'Scenes' }).getByRole('button').first().click();
  await expect(inspector(page).getByLabel('Reveal (optional)')).toHaveValue('We got a dog');
  await expect(inspector(page).getByLabel('Look')).toHaveValue('story');
});

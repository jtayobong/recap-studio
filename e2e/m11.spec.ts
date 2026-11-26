import { expect, test, type Page } from '@playwright/test';

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const chips = (page: Page) => page.getByRole('list', { name: 'Scenes' }).getByRole('button');

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
}

test('text scene: add it, write bullets, switch to a paragraph; saved', async ({ page }) => {
  await createProject(page);
  await page.getByRole('button', { name: /^\+ Text\b(?! carousel)/ }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 1 · Text' })).toBeVisible();
  await inspector(page).getByLabel('Title').fill('Lessons');
  await inspector(page).getByLabel('Text', { exact: true }).fill('Sleep more\nWalk every day');
  await inspector(page).getByLabel('Body').selectOption('paragraph');

  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await chips(page).first().click();
  await expect(inspector(page).getByLabel('Title')).toHaveValue('Lessons');
  await expect(inspector(page).getByLabel('Text', { exact: true })).toHaveValue('Sleep more\nWalk every day');
  await expect(inspector(page).getByLabel('Body')).toHaveValue('paragraph');
});

test('background motion: new projects start on Subtle; the choice is saved', async ({ page }) => {
  await createProject(page);
  const picker = page.getByRole('group', { name: 'Background motion' });
  await expect(picker.getByRole('radio', { name: 'Subtle' })).toBeChecked();
  await picker.getByText('Lively').click();
  await expect(picker.getByRole('radio', { name: 'Lively' })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Background motion' }).getByRole('radio', { name: 'Lively' })).toBeChecked();
});

test('move later keeps the moved scene in the preview', async ({ page }) => {
  await createProject(page);
  await page.getByRole('button', { name: /\+ Title/ }).click();
  await page.getByRole('button', { name: /\+ Section/ }).click();
  await chips(page).first().click();
  await inspector(page).getByRole('button', { name: 'Move later →' }).click();
  await expect(chips(page)).toHaveText([/Section/, /Title/]);
  await expect(inspector(page).getByRole('heading', { name: 'Scene 2 · Title' })).toBeVisible();
  // The scene playing under the playhead is the moved one.
  await expect(chips(page).nth(1)).toHaveAttribute('aria-current', 'step');
});

test('export: background motion and the text scene match the preview frame for frame, in both shapes', { tag: '@dev' }, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/system');
  const reports = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const db = await load('/src/db/index.ts');
    const exporter = await load('/src/export/exportStory.ts');
    const inspect = await load('/src/export/testing/inspectExport.ts');
    const registry = await load('/src/render/templates/registry.ts');
    const project = await db.projectRepository.create({ name: 'M11 export' });
    const scene = (id: string, durationMs: number, fields: Record<string, unknown>) => {
      const base = registry.createScene(id);
      return { ...base, durationMs, transitionIn: 'cut' as const, fields: { ...base.fields, ...fields } };
    };
    const scenes = [scene('text', 3000, {}), scene('text', 3000, { layout: 'paragraph' }), scene('big-number', 3000, {})];
    const times = [300, 1200, 2600, 3100, 4500, 6200, 8000];
    const out: Record<string, unknown> = {};
    for (const [shape, width, height] of [['portrait', 1080, 1920], ['landscape', 1920, 1080]] as const) {
      const style = { ...project.style, backgroundMotion: 'lively' };
      const saved = await db.projectRepository.save({ ...project, style, format: { ...project.format, width, height }, scenes });
      const file = await exporter.exportStory(saved, db.assetRepository);
      out[shape] = await inspect.inspectExport(file.blob, saved, times);
    }
    return out as Record<string, { frameDiffs: { timeMs: number; meanAbsDiff: number; badPixelShare: number }[] }>;
  });
  for (const [shape, report] of Object.entries(reports)) {
    testInfo.annotations.push({ type: shape, description: report.frameDiffs.map((d) => `${d.timeMs}: ${d.meanAbsDiff.toFixed(2)}`).join(', ') });
    for (const diff of report.frameDiffs) {
      expect(diff.meanAbsDiff, `${shape} at ${diff.timeMs} ms`).toBeLessThan(4);
      expect(diff.badPixelShare, `${shape} at ${diff.timeMs} ms`).toBeLessThan(0.005);
    }
  }
});

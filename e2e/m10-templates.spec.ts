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

test('section: add a divider between scenes and make it yours; saved', async ({ page }) => {
  await createProject(page);
  await page.getByRole('button', { name: /\+ Title/ }).click();
  await page.getByRole('button', { name: /\+ Section/ }).click();
  await expect(inspector(page).getByRole('heading', { name: 'Scene 2 · Section' })).toBeVisible();
  await expect(inspector(page).getByLabel('Label')).toHaveValue('Part 2');
  await inspector(page).getByLabel('Label').fill('Part 1');
  await inspector(page).getByLabel('Title').fill('Winter');
  await inspector(page).getByLabel('Small line').fill('December to February');
  await expect(inspector(page).getByLabel('Duration (seconds)')).toHaveValue('2.5');

  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(chips(page)).toHaveText([/Title/, /Section/]);
  await chips(page).nth(1).click();
  await expect(inspector(page).getByLabel('Title')).toHaveValue('Winter');
  await expect(inspector(page).getByLabel('Small line')).toHaveValue('December to February');
});

test('export: the text carousel and section scenes match the preview frame for frame, in both shapes', { tag: '@dev' }, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/system');
  const reports = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const db = await load('/src/db/index.ts');
    const exporter = await load('/src/export/exportStory.ts');
    const inspect = await load('/src/export/testing/inspectExport.ts');
    const registry = await load('/src/render/templates/registry.ts');
    const project = await db.projectRepository.create({ name: 'M10 export' });
    const scene = (id: string, durationMs: number, fields: Record<string, unknown>) => {
      const base = registry.createScene(id);
      return { ...base, durationMs, transitionIn: 'cut' as const, fields: { ...base.fields, ...fields } };
    };
    const scenes = [
      scene('section', 2500, {}),
      scene('text-carousel', 4500, { direction: 'left' }),
      scene('text-carousel', 4500, { direction: 'up' }),
    ];
    // Entering, settled, moving between cards and holding, in each scene.
    const times = [300, 1300, 2600, 4000, 4300, 6000, 7400, 8600, 10_000, 11_200];
    const out: Record<string, unknown> = {};
    for (const [shape, width, height] of [['portrait', 1080, 1920], ['landscape', 1920, 1080]] as const) {
      const saved = await db.projectRepository.save({ ...project, format: { ...project.format, width, height }, scenes });
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

import { expect, type Page } from '@playwright/test';
import type * as SceneActions from '../../src/editor/sceneActions';

/**
 * Adds the minimal two-scene story (Title 3.5 s + Big Number 5 s = 8.5 s) to the open, empty
 * project through the app's own editor action (same module instance as the UI). For tests that
 * need *a* story with known timing; the starter-story picker itself is tested in starters.spec.ts.
 */
export async function addBasicStory(page: Page): Promise<void> {
  // The editor has loaded the (empty) project once the starter picker shows.
  await expect(page.getByRole('list', { name: 'Starter stories' })).toBeVisible();
  await page.evaluate(async () => {
    const actions = (await import('/src/editor/sceneActions.ts' as string)) as typeof SceneActions;
    actions.addStarterScenes();
  });
  await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('button')).toHaveCount(2);
}

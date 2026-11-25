import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Smoke test of the packaged desktop app (run `npm run desktop:build` first).
 * The built .exe is started with WebView2's debugging port open and a throwaway data folder (never
 * the user's real app data); Playwright attaches over CDP and uses the app like a user would.
 */

const EXE = join('src-tauri', 'target', 'release', 'recap-studio.exe');
const PORT = 9333;

test.skip(!existsSync(EXE), `Build the desktop app first (npm run desktop:build): ${EXE} not found`);
test.setTimeout(180_000);

let dataDir: string;
let app: ChildProcess | undefined;
let browser: Browser | undefined;

async function launch(): Promise<Page> {
  app = spawn(EXE, [], {
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: dataDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: 'ignore',
  });
  // The WebView needs a moment to start and open the port.
  for (let attempt = 0; ; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
      break;
    } catch (error) {
      if (attempt > 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const context = browser.contexts()[0]!;
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForLoadState();
  return page;
}

async function quit() {
  await browser?.close().catch(() => undefined);
  browser = undefined;
  if (app && app.exitCode === null) {
    const exited = new Promise((resolve) => app!.once('exit', resolve));
    app.kill();
    await exited;
  }
  app = undefined;
}

test.beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'recap-desktop-'));
});

test.afterAll(async () => {
  await quit();
  // WebView2 may hold files briefly after exit.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
});

// Playwright requires a destructuring pattern for the fixtures argument, even when none are used.
// eslint-disable-next-line no-empty-pattern
test('the desktop app runs the editor offline, exports a 16:9 video and keeps projects across restarts', async ({}, testInfo) => {
  let page = await launch();

  // Served by the app itself from a fixed secure origin, with the production security policy.
  expect(new URL(page.url()).origin).toBe('https://tauri.localhost');
  const blocked = await page.evaluate(() => {
    try {
      document.createElement('div').innerHTML = '<b>x</b>';
      return false;
    } catch {
      return true; // Trusted Types refuses HTML strings
    }
  });
  expect(blocked).toBe(true);

  // This WebView can store media and export.
  await page.getByRole('link', { name: 'System' }).click();
  await expect(page.getByText('MP4 (H.264 + AAC)').first()).toBeVisible();
  await page.getByRole('link', { name: 'Projects' }).click();

  // A 16:9 project from a starter, exported and downloaded.
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Desktop trip');
  await dialog.locator('label', { hasText: 'Landscape' }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('list', { name: 'Starter stories' }).getByRole('button', { name: /Travel year/ }).click();
  await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('button')).toHaveCount(7);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export video' }).getByRole('button', { name: 'Start export' }).click();
  const status = page.getByRole('status', { name: 'Export' });
  await expect(status).toContainText('✓ desktop-trip.mp4', { timeout: 120_000 });
  const downloading = page.waitForEvent('download');
  await status.getByRole('link', { name: 'Download' }).click();
  const download = await downloading;
  const file = testInfo.outputPath('desktop-trip.mp4');
  await download.saveAs(file);
  const bytes = readFileSync(file);
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  expect(bytes.length).toBeGreaterThan(200_000);

  // Close the app and start it again: the project is still there.
  await page.getByRole('link', { name: '← Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await quit();
  page = await launch();
  await expect(page.getByRole('heading', { name: 'Desktop trip' })).toBeVisible();
});

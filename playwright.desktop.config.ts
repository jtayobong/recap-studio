import { defineConfig } from '@playwright/test';

/**
 * Smoke test of the packaged desktop app (Tauri + WebView2, Windows). Run `npm run desktop:build`
 * first, then `npm run test:desktop`. The test starts the built .exe itself and attaches over CDP,
 * so there is no web server and no browser project here.
 */
export default defineConfig({
  testDir: 'e2e-desktop',
  workers: 1,
  reporter: 'list',
  use: { trace: 'off' },
});

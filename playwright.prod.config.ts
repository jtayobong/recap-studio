import { defineConfig, devices } from '@playwright/test';

/**
 * The main e2e flows against the production build (`vite preview`, strict CSP and security
 * headers). Tests tagged `@dev` reach into app modules through the dev server (`/src/...` imports)
 * and only run with the default config. Run with `npm run test:e2e:prod` (builds first).
 */
export default defineConfig({
  testDir: 'e2e',
  grepInvert: /@dev/,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: false },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Content Security Policy for the production preview server (reviewed in M8).
 * Everything is local: no third-party scripts, fonts or network calls.
 * - `blob:` only where media object URLs are used (thumbnails, previews, the export download).
 * - The export worker is a same-origin file, so workers need no `blob:`.
 * - Inline style *attributes* set by React go through the CSSOM, which CSP doesn't block, so
 *   `style-src` stays `'self'`.
 * - Trusted Types: the app never assigns HTML strings to the DOM (lint bans
 *   `dangerouslySetInnerHTML`), so every script sink is refused except the export worker's URL,
 *   which goes through the single allowed policy (src/export/workerUrl.ts).
 * Not applied to the dev server, because React Fast Refresh injects an inline script.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  // One policy, which only accepts the bundled export worker's URL (src/export/workerUrl.ts).
  'trusted-types recap-export-worker',
].join('; ');

/** Browser features the app never uses, switched off. */
const permissionsPolicy = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=()';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  optimizeDeps: {
    // Loaded lazily (export); pre-bundle at startup so the first import doesn't force a dev reload.
    include: ['mediabunny'],
  },
  server: {
    // Never expose the editor to the local network by default.
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': contentSecurityPolicy,
      'Permissions-Policy': permissionsPolicy,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Framework code in its own chunk (cached across app updates). Mediabunny stays out: it is
        // only loaded on demand by the exporter.
        manualChunks(id) {
          if (id.includes('node_modules') && !id.includes('mediabunny')) return 'vendor';
          return undefined;
        },
      },
    },
    // The vendor chunk alone is ~530 kB (react-dom, Dexie, Zod, React Router; ~170 kB gzipped);
    // app code is split by route. Warn only if something grows well beyond that.
    chunkSizeWarningLimit: 600,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Gives Dexie a spec-compliant in-memory IndexedDB in Node.
    setupFiles: ['fake-indexeddb/auto'],
  },
});

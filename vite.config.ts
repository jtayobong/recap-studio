import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Content Security Policy for the production preview server.
 * Everything is local: no third-party scripts, fonts or network calls.
 * `blob:` is needed for media object URLs and (later) export workers.
 * Not applied to the dev server, because React Fast Refresh injects an inline script.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Gives Dexie a spec-compliant in-memory IndexedDB in Node.
    setupFiles: ['fake-indexeddb/auto'],
  },
});

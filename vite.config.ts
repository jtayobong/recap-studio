import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY } from './src/security/policy';

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
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Permissions-Policy': PERMISSIONS_POLICY,
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

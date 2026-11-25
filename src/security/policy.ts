/**
 * Content Security Policy for the production build (reviewed in M8): sent as a header by
 * `vite preview` (vite.config.ts) and set by the desktop app (src-tauri/tauri.conf.json, kept
 * identical by src/security/policy.test.ts).
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
export const CONTENT_SECURITY_POLICY = [
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
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=()';

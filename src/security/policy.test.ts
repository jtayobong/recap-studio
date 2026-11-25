import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY } from './policy';

/** The desktop app (Tauri) must ship the same security policy as the production web build. */
describe('desktop security policy', () => {
  const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8')) as {
    app: { withGlobalTauri?: boolean; security: { csp: string; headers: Record<string, string> } };
  };

  it('uses the same CSP and Permissions-Policy as vite preview', () => {
    expect(conf.app.security.csp).toBe(CONTENT_SECURITY_POLICY);
    expect(conf.app.security.headers['Permissions-Policy']).toBe(PERMISSIONS_POLICY);
  });

  it('exposes no Tauri APIs to the page', () => {
    expect(conf.app.withGlobalTauri).toBe(false);
    const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf-8')) as { permissions: unknown[] };
    expect(capability.permissions).toEqual([]);
  });
});

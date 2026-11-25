import { expect, test } from '@playwright/test';

/**
 * Production-only (`@prod`, run by `npm run test:e2e:prod`): the preview server sends the security
 * headers, and the browser enforces them.
 */

test('the production build sends a strict CSP and security headers', { tag: '@prod' }, async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();
  const csp = headers['content-security-policy'] ?? '';
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types recap-export-worker',
  ]) {
    expect(csp).toContain(directive);
  }
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['permissions-policy']).toContain('microphone=()');
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('Trusted Types blocks HTML injection and unknown policies', { tag: '@prod' }, async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const attempt = (fn: () => void) => {
      try {
        fn();
        return 'allowed';
      } catch (error) {
        return (error as Error).name;
      }
    };
    return {
      innerHTML: attempt(() => {
        document.createElement('div').innerHTML = '<img src=x onerror=alert(1)>';
      }),
      otherPolicy: attempt(() => {
        (window as unknown as { trustedTypes: { createPolicy(n: string, r: object): unknown } }).trustedTypes.createPolicy('evil', {});
      }),
      inlineScript: attempt(() => {
        const script = document.createElement('script');
        script.textContent = 'window.__pwned = true';
        document.body.append(script);
      }),
    };
  });
  expect(result.innerHTML).toBe('TypeError');
  expect(result.otherPolicy).toBe('TypeError');
  expect(result.inlineScript).toBe('TypeError');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
});

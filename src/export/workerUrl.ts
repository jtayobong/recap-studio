import exportWorkerUrl from './export.worker.ts?worker&url';

/**
 * The export worker's script URL, as a Trusted Types value where the page enforces them.
 * The production CSP has `require-trusted-types-for 'script'` and allows exactly one policy,
 * `recap-export-worker`, which only ever accepts this bundled worker's own URL. Elsewhere (the dev
 * server sends no CSP, older browsers) the plain URL is used.
 */
export const EXPORT_WORKER_POLICY = 'recap-export-worker';

interface TrustedTypePolicyFactoryLike {
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): { createScriptURL(input: string): unknown };
}

let policy: { createScriptURL(input: string): unknown } | null | undefined;

export function exportWorkerScriptUrl(): string | URL {
  const factory = (globalThis as { trustedTypes?: TrustedTypePolicyFactoryLike }).trustedTypes;
  if (!factory) return exportWorkerUrl;
  policy ??= factory.createPolicy(EXPORT_WORKER_POLICY, {
    createScriptURL(input) {
      if (input !== exportWorkerUrl) throw new TypeError(`Refusing to load an unexpected worker script: ${input}`);
      return input;
    },
  });
  // A TrustedScriptURL is accepted by `new Worker` wherever a URL string is.
  return policy.createScriptURL(exportWorkerUrl) as string;
}

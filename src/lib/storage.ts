export interface StorageInfo {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const storage = navigator.storage;
  if (!storage) return { usageBytes: null, quotaBytes: null, persisted: null };

  const [estimate, persisted] = await Promise.all([
    storage.estimate?.().catch(() => undefined),
    storage.persisted?.().catch(() => null),
  ]);

  return {
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
    persisted: persisted ?? null,
  };
}

/**
 * Ask the browser not to evict our data under storage pressure.
 * Chromium usually grants this silently for installed or frequently used sites; others may prompt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Warn when less than this is free… */
export const LOW_FREE_BYTES = 1024 ** 3;
/** …or when this share of the quota is used. */
export const LOW_USED_SHARE = 0.85;

export function freeBytes(info: StorageInfo): number | null {
  if (info.usageBytes === null || info.quotaBytes === null) return null;
  return Math.max(0, info.quotaBytes - info.usageBytes);
}

/** Whether storage is getting tight (unknown estimates never warn). */
export function isStorageLow(info: StorageInfo): boolean {
  const free = freeBytes(info);
  if (free === null || info.quotaBytes === null || info.quotaBytes <= 0) return false;
  return free < LOW_FREE_BYTES || (info.usageBytes ?? 0) / info.quotaBytes >= LOW_USED_SHARE;
}

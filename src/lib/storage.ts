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

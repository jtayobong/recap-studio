import { useEffect, useSyncExternalStore } from 'react';
import type { AssetRepository } from '../db/assetRepository';

/**
 * Per-asset UI status for the media library: thumbnail object URL and whether the binary is
 * still in storage. An external store (useSyncExternalStore) so components never set state in
 * effects, and so object URLs are created once per asset and revoked in exactly one place.
 */
export type AssetStatus =
  | { state: 'loading' }
  | { state: 'ready'; thumbnailUrl?: string }
  /** The asset row exists but its file is gone (e.g. site data partially cleared). */
  | { state: 'missing'; thumbnailUrl?: string };

const LOADING: AssetStatus = { state: 'loading' };

export function createAssetStatusStore(assets: Pick<AssetRepository, 'readFile' | 'readThumbnail'>) {
  const entries = new Map<string, AssetStatus>();
  const pending = new Set<string>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function get(id: string): AssetStatus {
    return entries.get(id) ?? LOADING;
  }

  /** Start loading an asset's status unless it is loaded or loading. Resolves when done. */
  async function ensure(id: string): Promise<void> {
    if (entries.has(id) || pending.has(id)) return;
    pending.add(id);
    let status: AssetStatus;
    try {
      const [file, thumbnail] = await Promise.all([assets.readFile(id), assets.readThumbnail(id)]);
      const thumbnailUrl = thumbnail ? URL.createObjectURL(thumbnail) : undefined;
      status = file ? { state: 'ready', thumbnailUrl } : { state: 'missing', thumbnailUrl };
    } catch {
      status = { state: 'missing' };
    }
    if (!pending.delete(id)) {
      // Released while loading: don't resurrect it.
      if (status.thumbnailUrl) URL.revokeObjectURL(status.thumbnailUrl);
      return;
    }
    entries.set(id, status);
    notify();
  }

  /** Forget an asset (deleted, or to re-check it) and free its object URL. */
  function release(id: string): void {
    const status = entries.get(id);
    if (status && status.state !== 'loading' && status.thumbnailUrl) URL.revokeObjectURL(status.thumbnailUrl);
    entries.delete(id);
    pending.delete(id);
    notify();
  }

  function releaseAll(): void {
    for (const id of [...entries.keys()]) release(id);
  }

  return { subscribe, get, ensure, release, releaseAll };
}

export type AssetStatusStore = ReturnType<typeof createAssetStatusStore>;

/** Subscribe to one asset's status and load it on first use. */
export function useAssetStatusFrom(store: AssetStatusStore, id: string): AssetStatus {
  const status = useSyncExternalStore(store.subscribe, () => store.get(id));
  useEffect(() => {
    void store.ensure(id);
  }, [store, id]);
  return status;
}

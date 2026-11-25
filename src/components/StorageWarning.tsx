import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { assetRepository } from '../db';
import { formatBytes } from '../lib/format';
import { freeBytes, getStorageInfo, isStorageLow, type StorageInfo } from '../lib/storage';

/** The browser's storage estimate, re-checked whenever media is added or removed. */
export function useStorageInfo(): StorageInfo | null {
  const mediaBytes = useLiveQuery(async () => (await assetRepository.listAll()).reduce((sum, a) => sum + a.bytes, 0), []);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  useEffect(() => {
    let current = true;
    void getStorageInfo().then((next) => {
      if (current) setInfo(next);
    });
    return () => {
      current = false;
    };
  }, [mediaBytes]);
  return info;
}

/** A banner when storage is getting tight, linking to the Storage page. Renders nothing otherwise. */
export function StorageWarning({ compact = false }: { compact?: boolean }) {
  const info = useStorageInfo();
  if (!info || !isStorageLow(info)) return null;
  const free = freeBytes(info);
  return (
    <div className={`storage-warning${compact ? ' storage-warning--compact' : ''}`} role="alert">
      Storage is almost full: {free === null ? 'little' : formatBytes(free)} left for this app. Imports and exports may
      fail. <Link to="/storage">Free up space</Link>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StorageWarning, useStorageInfo } from '../components/StorageWarning';
import { assetRepository, projectRepository } from '../db';
import { formatBytes, formatDuration } from '../lib/format';
import { freeBytes } from '../lib/storage';
import { mediaCache, assetStatus } from '../media';
import { deleteMedia, deleteUnusedMedia, getMediaUsage, type MediaItem } from '../storage/mediaUsage';

const deps = { projects: projectRepository, assets: assetRepository };
const KIND_LABEL = { image: 'Photo', video: 'Video', audio: 'Music' } as const;

/** What takes space (per project, largest media first), with cleanup. */
export function StoragePage() {
  const usage = useLiveQuery(() => getMediaUsage(deps), []);
  const info = useStorageInfo();
  const [pending, setPending] = useState<MediaItem | null>(null);
  const [confirmUnused, setConfirmUnused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const forget = (id: string) => {
    assetStatus.release(id);
    mediaCache.release(id);
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Storage</h1>
          <p className="page__subtitle">Media is stored in this browser. Delete what you no longer need to free up space.</p>
        </div>
      </div>

      <StorageWarning />

      <section className="card storage-summary" aria-label="Storage summary">
        <p>
          Media uses <strong>{usage ? formatBytes(usage.totalBytes) : '…'}</strong>
          {info?.quotaBytes != null && (
            <>
              {' '}
              · this browser allows about <strong>{formatBytes(info.quotaBytes)}</strong> for this app,{' '}
              <strong>{formatBytes(freeBytes(info) ?? 0)}</strong> still free
            </>
          )}
          .
        </p>
        {info?.quotaBytes != null && info.usageBytes != null && info.quotaBytes > 0 && (
          <meter className="storage-meter" min={0} max={info.quotaBytes} value={info.usageBytes} aria-label="Storage used" />
        )}
        {usage && usage.unused.count > 0 && (
          <button type="button" className="button" onClick={() => setConfirmUnused(true)}>
            Delete unused media ({usage.unused.count}, {formatBytes(usage.unused.bytes)})
          </button>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
      </section>

      {usage && usage.projects.length > 0 && (
        <section className="card">
          <h2>By project</h2>
          <table className="storage-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Media</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {usage.projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.count}</td>
                  <td>{formatBytes(p.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>Largest media</h2>
        {usage && usage.items.length === 0 && <p className="muted">No media stored yet.</p>}
        {usage && usage.items.length > 0 && (
          <table className="storage-table" aria-label="Media by size">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Project</th>
                <th scope="col">Size</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.items.map((item) => (
                <tr key={item.asset.id}>
                  <td>
                    {item.asset.filename}{' '}
                    <span className="muted">
                      · {KIND_LABEL[item.asset.kind]}
                      {item.asset.durationMs !== undefined && ` · ${formatDuration(item.asset.durationMs)}`}
                    </span>
                  </td>
                  <td>{item.projectName}</td>
                  <td>{formatBytes(item.asset.bytes)}</td>
                  <td>{item.used ? 'In use' : <span className="storage-unused">Unused</span>}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--small button--danger-text"
                      onClick={() => setPending(item)}
                      aria-label={`Delete ${item.asset.filename}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Delete media?"
        confirmLabel="Delete"
        destructive
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await deleteMedia(pending.asset.id, deps);
          forget(pending.asset.id);
          setNotice(`Deleted ${pending.asset.filename} (${formatBytes(pending.asset.bytes)}).`);
        }}
      >
        {pending && (
          <>
            <p>
              “{pending.asset.filename}” ({formatBytes(pending.asset.bytes)}) will be deleted from this computer’s storage.
              This can’t be undone.
            </p>
            {pending.used && <p>It’s used in “{pending.projectName}”; those scenes will show an empty media slot.</p>}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmUnused}
        title="Delete unused media?"
        confirmLabel="Delete unused media"
        destructive
        onClose={() => setConfirmUnused(false)}
        onConfirm={async () => {
          const ids = (usage?.items ?? []).filter((i) => !i.used).map((i) => i.asset.id);
          const freed = await deleteUnusedMedia(deps);
          ids.forEach(forget);
          setNotice(`Deleted ${freed.count} unused ${freed.count === 1 ? 'item' : 'items'}, freeing ${formatBytes(freed.bytes)}.`);
        }}
      >
        <p>
          {usage?.unused.count} {usage?.unused.count === 1 ? 'item' : 'items'} that no scene or song uses (
          {formatBytes(usage?.unused.bytes ?? 0)}) will be deleted from this computer’s storage. This can’t be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

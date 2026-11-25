import { useCallback, useEffect, useState } from 'react';
import { CapabilityTable } from '../components/CapabilityTable';
import { useCapabilities } from '../components/CapabilityGate';
import { CURRENT_SCHEMA_VERSION } from '../domain/project';
import { formatBytes } from '../lib/format';
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '../lib/storage';

export function SystemPage() {
  const report = useCapabilities();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [persistMessage, setPersistMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getStorageInfo().then(setStorage);
  }, []);

  useEffect(refresh, [refresh]);

  const handlePersist = async () => {
    const granted = await requestPersistentStorage();
    setPersistMessage(
      granted
        ? 'Granted. The browser will not clear your projects to free up space.'
        : 'Not granted. The browser decides this; it often allows it once you use the app regularly.',
    );
    refresh();
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>System</h1>
          <p className="page__subtitle">What this browser supports, and how much space your projects use.</p>
        </div>
      </div>

      <section className="card">
        <h2>Export</h2>
        <p>
          {report.exportTarget
            ? `Videos will be exported as ${report.exportTarget.label}.`
            : 'No supported video encoder was found, so export will not be available in this browser.'}
        </p>
      </section>

      <section className="card">
        <h2>Browser support</h2>
        <CapabilityTable results={report.results} />
      </section>

      <section className="card">
        <h2>Storage</h2>
        {storage === null ? (
          <p>Checking…</p>
        ) : (
          <dl className="facts">
            <dt>Used</dt>
            <dd>
              {storage.usageBytes === null ? 'Unknown' : formatBytes(storage.usageBytes)}
              {storage.quotaBytes !== null && ` of ${formatBytes(storage.quotaBytes)} available`}
            </dd>
            <dt>Protected from cleanup</dt>
            <dd>{storage.persisted === null ? 'Unknown' : storage.persisted ? 'Yes' : 'No'}</dd>
          </dl>
        )}
        {storage?.persisted === false && (
          <button type="button" className="button" onClick={() => void handlePersist()}>
            Keep my projects safe from cleanup
          </button>
        )}
        {persistMessage && <p className="muted">{persistMessage}</p>}
      </section>

      <p className="muted">
        App v{__APP_VERSION__} · project schema v{CURRENT_SCHEMA_VERSION}
      </p>
    </div>
  );
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { checkCapabilities, type CapabilityReport } from '../lib/capabilities';
import { describeError } from '../lib/errors';
import { CapabilityTable } from './CapabilityTable';

const CapabilityContext = createContext<CapabilityReport | null>(null);

export function useCapabilities(): CapabilityReport {
  const report = useContext(CapabilityContext);
  if (!report) throw new Error('useCapabilities must be used inside <CapabilityGate>.');
  return report;
}

type GateState =
  | { status: 'checking' }
  | { status: 'done'; report: CapabilityReport }
  | { status: 'failed'; error: string };

/**
 * Runs the browser capability check once on startup.
 * Blocks the app only when core storage features are missing; export gaps show a banner instead.
 */
export function CapabilityGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    checkCapabilities().then(
      (report) => !cancelled && setState({ status: 'done', report }),
      (error: unknown) => !cancelled && setState({ status: 'failed', error: describeError(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'checking') {
    return (
      <main className="fullscreen-message" aria-busy="true">
        <p>Checking your browser…</p>
      </main>
    );
  }

  if (state.status === 'failed') {
    return (
      <main className="fullscreen-message">
        <h1>Couldn't check browser support</h1>
        <pre className="error-detail">{state.error}</pre>
      </main>
    );
  }

  if (!state.report.coreOk) {
    return (
      <main className="fullscreen-message fullscreen-message--wide">
        <h1>This browser can't run Recap Studio</h1>
        <p>
          Open the app at <code>http://localhost:5173</code> in a recent desktop version of Chrome or Edge. Private
          or incognito windows may also block local storage.
        </p>
        <CapabilityTable results={state.report.results} />
      </main>
    );
  }

  return <CapabilityContext.Provider value={state.report}>{children}</CapabilityContext.Provider>;
}

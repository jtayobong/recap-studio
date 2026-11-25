import type { CapabilityGroup, CapabilityResult } from '../lib/capabilities';

const GROUP_TITLES: Record<CapabilityGroup, string> = {
  core: 'Needed to use the editor',
  export: 'Needed to export video',
};

export function CapabilityTable({ results }: { results: CapabilityResult[] }) {
  return (
    <div className="capability-table">
      {(['core', 'export'] as const).map((group) => (
        <section key={group}>
          <h3>{GROUP_TITLES[group]}</h3>
          <ul>
            {results
              .filter((result) => result.group === group)
              .map((result) => (
                <li key={result.id} className={result.ok ? 'capability capability--ok' : 'capability capability--missing'}>
                  <span className="capability__status">{result.ok ? 'Supported' : 'Missing'}</span>
                  <span className="capability__label">{result.label}</span>
                  <span className="capability__why">{result.neededFor}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

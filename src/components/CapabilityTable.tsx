import type { CapabilityGroup, CapabilityResult } from '../lib/capabilities';

const GROUP_TITLES: Record<CapabilityGroup, string> = {
  core: 'Needed to use the editor',
  export: 'Needed to export video',
  optional: 'Optional extras',
};

export function CapabilityTable({ results }: { results: CapabilityResult[] }) {
  return (
    <div className="capability-table">
      {(['core', 'export', 'optional'] as const).map((group) => {
        const rows = results.filter((result) => result.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group}>
            <h3>{GROUP_TITLES[group]}</h3>
            <ul>
              {rows.map((result) => (
                <li
                  key={result.id}
                  className={`capability capability--${result.ok ? 'ok' : group === 'optional' ? 'unavailable' : 'missing'}`}
                >
                  <span className="capability__status">{result.ok ? 'Supported' : group === 'optional' ? 'Not available' : 'Missing'}</span>
                  <span className="capability__label">{result.label}</span>
                  <span className="capability__why">{result.neededFor}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

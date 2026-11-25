import { Link, NavLink, Outlet } from 'react-router';
import { useCapabilities } from './CapabilityGate';

export function AppShell() {
  const { exportOk } = useCapabilities();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          Recap Studio
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end className="nav-link">
            Projects
          </NavLink>
          <NavLink to="/system" className="nav-link">
            System
          </NavLink>
        </nav>
      </header>

      {!exportOk && (
        <div className="banner banner--warning" role="status">
          You can create and edit projects here, but this browser can't export video. Use desktop Chrome or Edge to
          export. <Link to="/system">See details</Link>
        </div>
      )}

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell';
import { CapabilityGate } from './components/CapabilityGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectsPage } from './pages/ProjectsPage';

/** Every route sits behind the capability check. */
function Root() {
  return (
    <CapabilityGate>
      <Outlet />
    </CapabilityGate>
  );
}

/**
 * A data router (not `<BrowserRouter>`), so pages can block navigation (`useBlocker`: the editor
 * asks before leaving with an unsaved export) and the editor, Storage and System pages are loaded
 * on first visit.
 */
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <ProjectsPage /> },
          // Loaded on first visit: keeps the start page's bundle small.
          { path: 'storage', lazy: async () => ({ Component: (await import('./pages/StoragePage')).StoragePage }) },
          { path: 'system', lazy: async () => ({ Component: (await import('./pages/SystemPage')).SystemPage }) },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      // The editor is full-screen, outside the app shell.
      { path: 'project/:projectId', lazy: async () => ({ Component: (await import('./pages/EditorPage')).EditorPage }) },
    ],
  },
]);

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

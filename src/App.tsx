import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell';
import { CapabilityGate } from './components/CapabilityGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EditorPage } from './pages/EditorPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { StoragePage } from './pages/StoragePage';
import { SystemPage } from './pages/SystemPage';

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
 * asks before leaving with an unsaved export) and routes can be lazy-loaded.
 */
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <ProjectsPage /> },
          { path: 'storage', element: <StoragePage /> },
          { path: 'system', element: <SystemPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      // The editor is full-screen, outside the app shell.
      { path: 'project/:projectId', element: <EditorPage /> },
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

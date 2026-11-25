import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { CapabilityGate } from './components/CapabilityGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EditorPage } from './pages/EditorPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SystemPage } from './pages/SystemPage';

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <CapabilityGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<ProjectsPage />} />
              <Route path="system" element={<SystemPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            {/* The editor is full-screen, outside the app shell. */}
            <Route path="project/:projectId" element={<EditorPage />} />
          </Routes>
        </CapabilityGate>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

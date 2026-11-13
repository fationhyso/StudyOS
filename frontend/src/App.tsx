import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import WorkspaceLayout from './components/WorkspaceLayout';
import { useAuth } from './context/AuthContext';
import { LoadingScreen } from './components/ui';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Files = lazy(() => import('./pages/Files'));

const Settings = lazy(() => import('./pages/Settings'));

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <WorkspaceLayout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/files" element={<Files />} />
          <Route path="/files/:documentId" element={<Files />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/integrations" element={<Navigate to="/settings" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

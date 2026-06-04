import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import Debts from './views/Debts';
import Budget from './views/Budget';
import Plan from './views/Plan';
import Advisor from './views/Advisor';
import Progress from './views/Progress';
import Login from './views/Login';
import AuthCallback from './views/AuthCallback';
import { useAuth } from './hooks/useAuth';

function PrivateRoute({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900">
      <span className="text-slate-400">Loading…</span>
    </div>
  );

  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function AppShell() {
  return (
    <div className="flex min-h-screen bg-navy-900">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"         element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/debts"    element={<PrivateRoute><Debts /></PrivateRoute>} />
          <Route path="/budget"   element={<PrivateRoute><Budget /></PrivateRoute>} />
          <Route path="/plan"     element={<PrivateRoute><Plan /></PrivateRoute>} />
          <Route path="/advisor"  element={<PrivateRoute><Advisor /></PrivateRoute>} />
          <Route path="/progress" element={<PrivateRoute><Progress /></PrivateRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/*"             element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}

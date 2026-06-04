import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/auth';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) { navigate('/login', { replace: true }); return; }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      navigate(error ? '/login' : '/', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900">
      <span className="text-slate-400">Signing you in…</span>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, signInWithMagicLink, supabase } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]         = useState<'password' | 'magic'>('password');
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (sent) return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900">
      <div className="rounded-xl bg-navy-800 p-8 text-center shadow-lg">
        <h2 className="text-xl font-semibold text-white">Check your email</h2>
        <p className="mt-2 text-slate-400">We sent a magic link to {email}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900">
      <div className="w-full max-w-sm rounded-xl bg-navy-800 p-8 shadow-lg">
        <h1 className="mb-6 text-2xl font-bold text-white">Sign in</h1>
        <button
          onClick={signInWithGoogle}
          className="mb-4 w-full rounded-lg bg-white py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
        >
          Continue with Google
        </button>
        <div className="relative my-4 text-center">
          <span className="relative z-10 bg-navy-800 px-2 text-xs uppercase tracking-widest text-slate-500">or</span>
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700" /></div>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePassword}>
            <label className="block text-sm text-slate-400">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-navy-900 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="you@example.com"
            />
            <label className="mt-3 block text-sm text-slate-400">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-navy-900 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="••••••••"
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => setMode('magic')}
              className="mt-3 w-full text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Use magic link instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink}>
            <label className="block text-sm text-slate-400">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-navy-900 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="you@example.com"
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
            <button type="button" onClick={() => setMode('password')}
              className="mt-3 w-full text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Use password instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

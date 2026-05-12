import { useState, useEffect } from 'react';
import { supabase, type Session, type User } from '../lib/auth';

interface AuthState { session: Session | null; user: User | null; loading: boolean; }

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, loading: false });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, loading: false });
    });
    return () => subscription.unsubscribe();
  }, []);

  return state;
}

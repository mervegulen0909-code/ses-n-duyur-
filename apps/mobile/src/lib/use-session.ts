import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/** The slice of `supabase.auth` that {@link watchAuthSession} needs. */
type AuthStateSource = {
  onAuthStateChange(
    callback: (event: string, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
};

/**
 * Subscribe to Supabase auth and report the session on every change.
 *
 * The FIRST event Supabase emits on subscribe is `INITIAL_SESSION`, fired only
 * AFTER the client finishes restoring persisted (encrypted, via LargeSecureStore)
 * auth state — so it is the authoritative first read. We deliberately do NOT also
 * call `getSession()`: its promise can resolve before the encrypted SecureStore
 * read completes on a cold start and briefly return `null` for an actually
 * signed-in user, which flashes the "please sign in" gate on Battle/Add/Leagues.
 * Relying on the first auth event removes that race entirely.
 *
 * `onChange` receives the session (or null) for every event. Returns an
 * unsubscribe function.
 */
export function watchAuthSession(
  auth: AuthStateSource,
  onChange: (session: Session | null) => void,
): () => void {
  const { data } = auth.onAuthStateChange((_event, next) => {
    onChange(next);
  });
  return () => data.subscription.unsubscribe();
}

/** Current Supabase auth session/user, kept in sync via onAuthStateChange. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The first event resolves `loading`; see watchAuthSession for why this
    // (not getSession) is the reliable cold-start signal.
    return watchAuthSession(supabase.auth, (next) => {
      setSession(next);
      setLoading(false);
    });
  }, []);

  return { session, user: session?.user ?? null, loading };
}

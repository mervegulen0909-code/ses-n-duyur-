import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vocal-league/db';
import { getServiceRoleKey, getSupabaseEnv } from '../env';

/**
 * Request-scoped client that respects the user's session (RLS as the user).
 * Returns null when Supabase env is not configured (so pages degrade safely).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component without a mutable cookie store — safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client (bypasses RLS). SERVER ONLY — never import from client
 * code. Used for writes the user is not allowed to make directly (e.g. scores).
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> | null {
  const env = getSupabaseEnv();
  const key = getServiceRoleKey();
  if (!env || !key) return null;
  return createClient<Database>(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

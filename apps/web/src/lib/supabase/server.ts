import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Database } from '@voxscore/db';
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

/** A request's authenticated user plus a Supabase client scoped to them (RLS). */
export interface RequestContext {
  readonly supabase: SupabaseClient<Database>;
  readonly user: User;
}

/**
 * Read the bearer token from an Authorization header, or null if absent/malformed.
 * Only `Authorization: Bearer <token>` is accepted; the header name match is
 * case-insensitive (per HTTP) and a non-empty token is required.
 */
function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Resolve the authenticated user for an API request, accepting BOTH auth styles
 * additively without weakening security:
 *
 *  1. Cookie session (web) — tried FIRST so the web path is byte-for-byte
 *     unchanged: the existing cookie client + `auth.getUser()`.
 *  2. `Authorization: Bearer <jwt>` (mobile) — a token-scoped anon client whose
 *     JWT is verified by Supabase via `auth.getUser()`. RLS applies as that user
 *     because the token rides in the client's global Authorization header.
 *
 * Returns the matching client + user, or null when neither path authenticates
 * (or Supabase env is not configured). The token is NEVER trusted unvalidated:
 * a user is only returned after Supabase verifies the JWT.
 */
export async function getRequestContext(req: Request): Promise<RequestContext | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  // 1. Cookie session first — keeps the web path identical.
  const cookieClient = await createSupabaseServerClient();
  if (cookieClient) {
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    if (user) return { supabase: cookieClient, user };
  }

  // 2. Bearer token (mobile). Build a client scoped to the token so RLS applies
  //    as that user, then verify the JWT with Supabase before trusting it.
  const token = bearerToken(req);
  if (!token) return null;

  const tokenClient = createClient<Database>(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await tokenClient.auth.getUser();
  if (!user) return null;

  return { supabase: tokenClient, user };
}

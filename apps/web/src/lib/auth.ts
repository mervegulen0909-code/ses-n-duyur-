import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient, type RequestContext } from './supabase/server';

/** The signed-in user, or null (not signed in / Supabase not configured). */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export interface Profile {
  id: string;
  handle: string;
  role: 'user' | 'admin';
}

/** The signed-in user's profile (handle + role), or null. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, handle, role')
    .eq('id', user.id)
    .maybeSingle();
  return data ?? null;
}

/** True when the signed-in user is an admin. */
export async function isAdmin(): Promise<boolean> {
  return (await getCurrentProfile())?.role === 'admin';
}

/**
 * The profile (handle + role) for an already-resolved request context, using
 * that context's RLS-scoped client. Works for BOTH cookie and bearer-token
 * auth, so admin API routes can authorize either client type identically.
 */
export async function getProfileForContext(ctx: RequestContext): Promise<Profile | null> {
  const { data } = await ctx.supabase
    .from('profiles')
    .select('id, handle, role')
    .eq('id', ctx.user.id)
    .maybeSingle();
  return data ?? null;
}

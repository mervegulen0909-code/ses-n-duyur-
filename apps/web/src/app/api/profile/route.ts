import { profileUpdateSchema } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { getSupabaseEnv } from '@/lib/env';

interface ProfilePatch {
  bio?: string | null;
  avatar_url?: string | null;
  links?: Json;
  locale?: 'en' | 'tr' | 'es' | 'fr' | 'ar' | 'hi' | 'zh';
}

/**
 * Self-service profile edit (bio/avatar/links). profiles_update_self (RLS)
 * + guard_profile_privileges (BEFORE UPDATE trigger, locks role/reputation
 * only) already let a user freely update these columns on their own row —
 * this route validates shape and, for avatarUrl, ALSO validates origin: it
 * must be a public URL under this project's own `avatars` Storage bucket,
 * scoped to the caller's own folder, never an arbitrary external URL
 * (stored-XSS-via-profile risk otherwise).
 */
function isOwnAvatarUrl(url: string, userId: string): boolean {
  const env = getSupabaseEnv();
  if (!env) return false;
  const prefix = `${env.url}/storage/v1/object/public/avatars/${userId}/`;
  return url.startsWith(prefix);
}

export async function PATCH(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid profile update' }, { status: 422 });
  }

  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const { bio, avatarUrl, links, locale } = parsed.data;
  if (avatarUrl && !isOwnAvatarUrl(avatarUrl, ctx.user.id)) {
    return Response.json({ error: 'avatarUrl must be your own uploaded avatar' }, { status: 422 });
  }

  const patch: ProfilePatch = {};
  if (bio !== undefined) patch.bio = bio;
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl;
  if (links !== undefined) patch.links = links as unknown as Json;
  if (locale !== undefined) patch.locale = locale;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 422 });
  }

  const { error } = await ctx.supabase.from('profiles').update(patch).eq('id', ctx.user.id);
  if (error) {
    return Response.json({ error: 'Could not update profile' }, { status: 500 });
  }

  return Response.json({ ok: true });
}

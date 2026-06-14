import { pushRegisterSchema } from '@voxscore/core';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * Register (upsert) this device's Expo push token for the signed-in user.
 *
 * rateLimit only (no botGuard): like comments, this must work from native, which
 * cannot supply a Turnstile token. The owner is the verified session/JWT user
 * (never a body-supplied id) — the upsert runs through the RLS-scoped client, so
 * push_tokens_insert_self / _update_own (user_id = auth.uid()) enforce ownership
 * at the DB layer too. Upsert on (user_id, token) makes re-registration idempotent
 * (the shared set_updated_at trigger bumps updated_at on the conflict-update path).
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = pushRegisterSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: user.id, token: parsed.data.token, platform: parsed.data.platform },
      { onConflict: 'user_id,token' },
    );
  if (error) return Response.json({ error: 'Could not register push token' }, { status: 500 });

  return Response.json({ ok: true }, { status: 201 });
}

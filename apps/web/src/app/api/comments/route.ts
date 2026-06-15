import { commentSchema } from '@voxscore/core';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * Post a comment on a performance.
 *
 * rateLimit only (no botGuard): comments are low-abuse-surface and we want this
 * to work from native, which cannot supply a Turnstile token. The author is the
 * verified session/JWT user (never a body-supplied id) — the insert runs through
 * the RLS-scoped client, so comments_insert_self (user_id = auth.uid()) enforces
 * authorship at the DB layer too.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = commentSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const { data, error } = await supabase
    .from('comments')
    .insert({
      performance_id: parsed.data.performanceId,
      user_id: user.id,
      body: parsed.data.body,
    })
    .select('id, body, created_at')
    .single();
  if (error) return Response.json({ error: 'Could not post comment' }, { status: 500 });

  return Response.json({ ok: true, comment: data }, { status: 201 });
}

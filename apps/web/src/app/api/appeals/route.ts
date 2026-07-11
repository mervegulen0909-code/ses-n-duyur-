import { appealSchema } from '@voxscore/core';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * A user appeals a moderation decision. Mirrors /api/performance-requests:
 * insert AS THE USER (RLS enforces user_id = auth.uid() and status =
 * 'pending'). rateLimit only (no botGuard) — a text appeal is low-abuse
 * surface, same posture as /api/comments and /api/follows.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = appealSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'A target and a reason (10-2000 characters) are required' },
      { status: 422 },
    );
  }

  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const { data: created, error } = await ctx.supabase
    .from('appeals')
    .insert({
      user_id: ctx.user.id,
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId,
      reason: parsed.data.reason,
    })
    .select('id')
    .single();

  if (error || !created) {
    return Response.json({ error: 'Could not submit appeal' }, { status: 500 });
  }

  return Response.json({ id: created.id }, { status: 201 });
}

/** The caller's own appeal history, newest first. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await ctx.supabase
    .from('appeals')
    .select('id, target_type, target_id, reason, status, resolution_note, created_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ error: 'Could not load appeals' }, { status: 500 });
  }
  return Response.json({ appeals: data ?? [] });
}

import { blockSchema } from '@voxscore/core';
import { getRequestContext, type RequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * Block/unblock a user by handle — App Store Review Guideline 1.2 requires the
 * ability to block abusive users. Mirrors /api/follows: inserts and deletes run
 * AS THE USER, so `blocker_id = auth.uid()` is enforced by RLS and the
 * `blocker_id <> blocked_id` check stops self-blocks even if the pre-check here
 * is bypassed. A block also severs follows in both directions, done by a
 * database trigger so every client gets it without repeating the logic.
 */
async function resolveTarget(
  req: Request,
): Promise<{ ctx: RequestContext; blockedId: string } | Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = blockSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'A handle is required' }, { status: 422 });
  }

  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  // Profiles are world-readable under RLS — the user-scoped client suffices.
  const { data: target } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('handle', parsed.data.blockedHandle)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: 'No such profile' }, { status: 404 });
  }
  if (target.id === ctx.user.id) {
    return Response.json({ error: 'You cannot block yourself' }, { status: 422 });
  }

  return { ctx, blockedId: target.id };
}

export async function POST(req: Request): Promise<Response> {
  const resolved = await resolveTarget(req);
  if (resolved instanceof Response) return resolved;
  const { ctx, blockedId } = resolved;

  const { error } = await ctx.supabase
    .from('blocked_users')
    .insert({ blocker_id: ctx.user.id, blocked_id: blockedId });

  if (error) {
    // Composite primary key catches the duplicate-block race. Blocking someone
    // already blocked is not a failure the user needs to see.
    if (error.code === '23505') return Response.json({ ok: true });
    return Response.json({ error: 'Could not block' }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const resolved = await resolveTarget(req);
  if (resolved instanceof Response) return resolved;
  const { ctx, blockedId } = resolved;

  const { error } = await ctx.supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', ctx.user.id)
    .eq('blocked_id', blockedId);

  if (error) {
    return Response.json({ error: 'Could not unblock' }, { status: 500 });
  }
  // Idempotent: unblocking someone you never blocked is still a 200.
  return Response.json({ ok: true });
}

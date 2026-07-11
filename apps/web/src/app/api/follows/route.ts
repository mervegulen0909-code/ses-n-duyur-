import { followSchema } from '@voxscore/core';
import { getRequestContext, type RequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * Follow/unfollow a creator by handle. Pure user-to-user RLS: inserts/deletes
 * run AS THE USER, so `follower_id = auth.uid()` is enforced by the database,
 * and the `follower_id <> followee_id` check blocks self-follows even if the
 * pre-check below is bypassed. rateLimit only (no botGuard) — same low-abuse
 * posture as /api/comments.
 */
async function resolveTarget(
  req: Request,
): Promise<{ ctx: RequestContext; followeeId: string } | Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = followSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'A followee handle is required' }, { status: 422 });
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
    .eq('handle', parsed.data.followeeHandle)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: 'No such profile' }, { status: 404 });
  }
  if (target.id === ctx.user.id) {
    return Response.json({ error: 'You cannot follow yourself' }, { status: 422 });
  }

  return { ctx, followeeId: target.id };
}

export async function POST(req: Request): Promise<Response> {
  const resolved = await resolveTarget(req);
  if (resolved instanceof Response) return resolved;
  const { ctx, followeeId } = resolved;

  const { error } = await ctx.supabase
    .from('follows')
    .insert({ follower_id: ctx.user.id, followee_id: followeeId });

  if (error) {
    // Composite primary key catches the duplicate-follow race.
    if (error.code === '23505') {
      return Response.json({ error: 'Already following' }, { status: 409 });
    }
    return Response.json({ error: 'Could not follow' }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const resolved = await resolveTarget(req);
  if (resolved instanceof Response) return resolved;
  const { ctx, followeeId } = resolved;

  const { error } = await ctx.supabase
    .from('follows')
    .delete()
    .eq('follower_id', ctx.user.id)
    .eq('followee_id', followeeId);

  if (error) {
    return Response.json({ error: 'Could not unfollow' }, { status: 500 });
  }
  // Idempotent: unfollowing someone you don't follow is still a 200.
  return Response.json({ ok: true });
}

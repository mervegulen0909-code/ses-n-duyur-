import { appealActionSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { createScoredPerformance, DuplicateVideoError } from '@/lib/performance-create';

/**
 * Admin: uphold or deny a pending appeal. Mirrors
 * /api/admin/performance-requests: admin gate, load-then-branch, and (for an
 * uphold) perform the actual reversal in the same request — never just flip
 * a status flag and leave the underlying decision untouched.
 *
 * `target_id` is intentionally not a hard FK (same polymorphic pattern as
 * moderation_flags.target_id), so reversal logic branches on `target_type`:
 *  - 'performance': un-hide it (status back to 'active').
 *  - 'performance_request': re-run the SAME scoring pipeline the original
 *    approval would have used, for the ORIGINAL requester.
 *  - 'comment': nothing in this codebase currently hides/removes a comment
 *    (moderation only ever acts on performances), so there is no target
 *    mutation to perform — the appeal is simply marked upheld.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = appealActionSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });
  // Narrowed once here — TS doesn't carry the safeParse discriminant into the
  // nested `finalize` closure below.
  const input = parsed.data;

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: appeal, error: loadError } = await service
    .from('appeals')
    .select('id, target_type, target_id, status')
    .eq('id', input.appealId)
    .maybeSingle();
  if (loadError || !appeal) {
    return Response.json({ error: 'Appeal not found' }, { status: 404 });
  }
  if (appeal.status !== 'pending') {
    return Response.json({ error: 'Appeal has already been reviewed' }, { status: 409 });
  }

  async function finalize(status: 'upheld' | 'denied', performanceId?: string) {
    const now = new Date().toISOString();
    const { error } = await service!
      .from('appeals')
      .update({
        status,
        reviewer_id: ctx!.user.id,
        reviewed_at: now,
        resolution_note: input.resolutionNote ?? null,
      })
      .eq('id', appeal!.id);
    if (error) {
      console.error(
        `[admin/appeals] appeal ${appeal!.id} reversed but status update failed`,
        error,
      );
    }
    await service!.from('appeals_audit').insert({
      appeal_id: appeal!.id,
      actor: ctx!.user.id,
      action: status,
      note: input.resolutionNote ?? null,
    });
    return Response.json({ ok: true, ...(performanceId ? { performanceId } : {}) });
  }

  if (input.action === 'deny') {
    return finalize('denied');
  }

  // Uphold: perform the actual reversal before marking the appeal resolved.
  if (appeal.target_type === 'performance') {
    const { error } = await service
      .from('performances')
      .update({ status: 'active' })
      .eq('id', appeal.target_id);
    if (error) {
      console.error(`[admin/appeals] could not un-hide performance ${appeal.target_id}`, error);
      return Response.json({ error: 'Could not un-hide the performance' }, { status: 500 });
    }
    return finalize('upheld');
  }

  if (appeal.target_type === 'performance_request') {
    const { data: request, error: requestError } = await service
      .from('performance_requests')
      .select('id, user_id, youtube_url, category, status')
      .eq('id', appeal.target_id)
      .maybeSingle();
    if (requestError || !request) {
      return Response.json({ error: 'Target performance request not found' }, { status: 404 });
    }
    if (request.status !== 'rejected') {
      return Response.json(
        { error: 'Target performance request is not in a rejected state' },
        { status: 409 },
      );
    }

    try {
      const perf = await createScoredPerformance(service, {
        userId: request.user_id,
        youtubeUrl: request.youtube_url,
        category: request.category,
      });
      const { error } = await service
        .from('performance_requests')
        .update({
          status: 'approved',
          reviewer_id: ctx.user.id,
          reviewed_at: new Date().toISOString(),
          approved_performance_id: perf.id,
        })
        .eq('id', request.id);
      if (error) {
        console.error(
          `[admin/appeals] approved performance ${perf.id} but failed to update request ${request.id}`,
          error,
        );
      }
      return finalize('upheld', perf.id);
    } catch (err) {
      // Never leave a scoreless performance and never silently mark the
      // appeal resolved when the reversal itself failed — the admin retries
      // or denies manually with a real reason.
      const reason =
        err instanceof DuplicateVideoError ? 'video already in the league' : 'pipeline failure';
      console.error(`[admin/appeals] uphold failed for request ${request.id}: ${reason}`, err);
      return Response.json(
        { error: 'Could not reverse this decision automatically' },
        {
          status: 502,
        },
      );
    }
  }

  // 'comment': no removal mechanism exists in this codebase to reverse.
  return finalize('upheld');
}

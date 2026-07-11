import { performanceRequestActionSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { createScoredPerformance, DuplicateVideoError } from '@/lib/performance-create';
import { trackServer } from '@/lib/analytics-server';
import { notifyServer } from '@/lib/notify';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = performanceRequestActionSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: request, error: loadError } = await service
    .from('performance_requests')
    .select('id, user_id, youtube_url, category, status')
    .eq('id', parsed.data.requestId)
    .maybeSingle();
  if (loadError || !request) {
    return Response.json({ error: 'Request not found' }, { status: 404 });
  }
  if (request.status !== 'pending') {
    return Response.json({ error: 'Request has already been reviewed' }, { status: 409 });
  }

  if (parsed.data.action === 'reject') {
    const { error } = await service
      .from('performance_requests')
      .update({
        status: 'rejected',
        reviewer_id: ctx.user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: parsed.data.rejectionReason,
      })
      .eq('id', request.id);
    if (error) return Response.json({ error: 'Could not reject request' }, { status: 500 });
    await notifyServer(service, request.user_id, 'performance_request_rejected', {
      requestId: request.id,
    });
    return Response.json({ ok: true });
  }

  // Approve: create the scored performance for the REQUESTER (not the admin),
  // then mark the request approved. The pipeline's own rollback guarantees a
  // failure here never leaves an orphan, scoreless performance.
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
      // The performance + score are already persisted and correct; only the
      // request row's bookkeeping failed. Surface loudly rather than silently
      // leaving the request stuck "pending" with an orphaned approval.
      console.error(
        `[admin/performance-requests] approved performance ${perf.id} but failed to update request ${request.id}`,
        error,
      );
    }
    await trackServer(service, 'performance_request_approved', request.user_id, {
      requestId: request.id,
    });
    await notifyServer(service, request.user_id, 'performance_request_approved', {
      requestId: request.id,
    });
    return Response.json({ id: perf.id }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateVideoError) {
      await service
        .from('performance_requests')
        .update({
          status: 'rejected',
          reviewer_id: ctx.user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: 'duplicate video',
        })
        .eq('id', request.id);
      return Response.json({ error: 'This video is already in the league' }, { status: 409 });
    }
    // Any other failure: leave the request pending so an admin can retry —
    // NEVER leave a scoreless performance (the pipeline's own rollback
    // already guarantees that at the DB layer).
    console.error(
      `[admin/performance-requests] approve failed for request ${request.id}; left pending`,
      err,
    );
    return Response.json({ error: 'Could not approve request' }, { status: 502 });
  }
}

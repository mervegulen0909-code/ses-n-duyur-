import { parseYouTubeId, performanceRequestSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';
import {
  createScoredPerformance,
  DuplicateVideoError,
  OEmbedFetchError,
  repairMissingInitialScores,
} from '@/lib/performance-create';

/**
 * Users submit a YouTube URL here; the server immediately validates metadata,
 * creates the active scored performance, and stores an approved request record
 * for history/audit. No admin queue for normal catalog additions.
 */
export async function POST(req: Request): Promise<Response> {
  let rawBody: string;
  let json: unknown;
  try {
    rawBody = await req.text();
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = performanceRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid input: a valid YouTube URL and category are required' },
      { status: 422 },
    );
  }

  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req, user.id, rawBody);
  if (bot) return bot;

  // Schema already validated the URL is parseable; this is a defensive guard.
  const videoId = parseYouTubeId(parsed.data.youtubeUrl);
  if (!videoId) {
    return Response.json({ error: 'Invalid YouTube URL' }, { status: 422 });
  }

  // Duplicate pre-checks need visibility across ALL users (not just the
  // caller's own rows, which is all RLS grants a user-scoped client), so use
  // the service client. The unique index is the actual race-safe guard —
  // these are only for a friendly message on the common (non-racing) path.
  const service = createSupabaseServiceClient();
  if (!service) {
    return Response.json({ error: 'Server not configured' }, { status: 503 });
  }

  const { data: existingPerf } = await service
    .from('performances')
    .select('id')
    .eq('youtube_video_id', videoId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingPerf) {
    return Response.json({ error: 'This video is already in the league' }, { status: 409 });
  }

  try {
    const performance = await createScoredPerformance(service, {
      userId: user.id,
      category: parsed.data.category,
      youtubeUrl: parsed.data.youtubeUrl,
    });

    const { data: audit } = await service
      .from('performance_requests')
      .insert({
        user_id: user.id,
        youtube_video_id: videoId,
        youtube_url: parsed.data.youtubeUrl,
        category: parsed.data.category,
        note: parsed.data.note ?? null,
        status: 'approved',
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
        approved_performance_id: performance.id,
      })
      .select('id')
      .single();

    await trackServer(service, 'performance_request_approved', user.id, {
      ...(audit?.id ? { requestId: audit.id } : {}),
      performanceId: performance.id,
      category: parsed.data.category,
      automatic: 1,
    });

    return Response.json({ id: performance.id, requestId: audit?.id ?? null }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateVideoError) {
      return Response.json({ error: 'This video is already in the league' }, { status: 409 });
    }
    if (err instanceof OEmbedFetchError) {
      return Response.json({ error: 'Could not verify this YouTube video' }, { status: 422 });
    }
    console.error('[performance-requests] automatic add failed', err);
    return Response.json({ error: 'Could not add performance' }, { status: 502 });
  }
}

/** The caller's own request history, newest first — for a "my requests" UI. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from('performance_requests')
    .select(
      'id, status, category, youtube_url, rejection_reason, created_at, approved_performance_id',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ error: 'Could not load requests' }, { status: 500 });
  }
  const service = createSupabaseServiceClient();
  if (service) {
    await repairMissingInitialScores(
      service,
      (data ?? []).flatMap((row) =>
        row.approved_performance_id ? [row.approved_performance_id] : [],
      ),
    );
  }

  return Response.json({
    requests: (data ?? []).map(
      ({ approved_performance_id: _approvedPerformanceId, ...row }) => row,
    ),
  });
}

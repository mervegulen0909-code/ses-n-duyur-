import { parseYouTubeId, performanceRequestSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';

/**
 * Normal users never create performances directly — they submit a request
 * here and an admin approves/rejects it (`/api/admin/performance-requests`).
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
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
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req);
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

  const { data: existingPending } = await service
    .from('performance_requests')
    .select('id')
    .eq('youtube_video_id', videoId)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingPending) {
    return Response.json(
      { error: 'A request for this video is already pending review' },
      { status: 409 },
    );
  }

  // Insert AS THE USER — RLS enforces user_id = auth.uid() and status = 'pending'.
  const { data: created, error } = await supabase
    .from('performance_requests')
    .insert({
      user_id: user.id,
      youtube_video_id: videoId,
      youtube_url: parsed.data.youtubeUrl,
      category: parsed.data.category,
      note: parsed.data.note ?? null,
    })
    .select('id')
    .single();

  if (error || !created) {
    // The unique partial index (one pending request per video) catches races
    // the pre-check above missed.
    if (error?.code === '23505') {
      return Response.json(
        { error: 'A request for this video is already pending review' },
        { status: 409 },
      );
    }
    return Response.json({ error: 'Could not submit request' }, { status: 500 });
  }

  return Response.json({ id: created.id }, { status: 201 });
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
    .select('id, status, category, youtube_url, rejection_reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ error: 'Could not load requests' }, { status: 500 });
  }
  return Response.json({ requests: data ?? [] });
}

import {
  addPerformanceSchema,
  buildPerformanceCreate,
  fetchOEmbed,
  parseYouTubeId,
} from '@vocal-league/core';
import type { Json } from '@vocal-league/db';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getScoringProvider } from '@/lib/adapters/scoring';
import { botGuard, rateLimit } from '@/lib/guard';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addPerformanceSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid input: a valid YouTube URL is required' },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req);
  if (bot) return bot;

  // Scores are written with the service role (RLS blocks user writes), and
  // performances has no DELETE policy — so a user-scoped rollback is impossible.
  // Acquire the service client up front, BEFORE the oEmbed fetch, the (paid) LLM
  // scoring call, and the performance insert: a missing/invalid service key then
  // fails fast and can never leave an orphan, scoreless (unrankable) performance.
  const service = createSupabaseServiceClient();
  if (!service) {
    console.error(
      '[performances] SUPABASE_SERVICE_ROLE_KEY missing/invalid — refusing to create a scoreless performance',
    );
    return Response.json(
      { error: 'Scoring is temporarily unavailable. Please try again later.' },
      { status: 503 },
    );
  }

  const videoId = parseYouTubeId(parsed.data.youtubeUrl);
  if (!videoId) {
    return Response.json({ error: 'Invalid YouTube URL' }, { status: 422 });
  }

  let oembed;
  try {
    oembed = await fetchOEmbed(videoId);
  } catch {
    return Response.json({ error: 'Could not fetch YouTube metadata' }, { status: 502 });
  }

  const scoring = await getScoringProvider().score({
    videoId,
    title: oembed.title,
    authorName: oembed.authorName,
    hasVideo: true,
  });

  const payload = buildPerformanceCreate({
    userId: user.id,
    youtubeUrl: parsed.data.youtubeUrl,
    oembed,
    scoring,
    songId: parsed.data.songId ?? null,
  });

  // Insert the performance AS THE USER (RLS enforces user_id = auth.uid()).
  const { data: perf, error: perfError } = await supabase
    .from('performances')
    .insert({
      ...payload.performance,
      oembed_meta: payload.performance.oembed_meta as unknown as Json,
    })
    .select('id')
    .single();

  if (perfError || !perf) {
    return Response.json({ error: 'Could not create performance' }, { status: 500 });
  }

  // Write the score row. If it fails, roll back the performance (service role
  // bypasses RLS) so we never persist a performance without its score, and
  // surface the failure instead of silently swallowing it.
  const { error: scoreError } = await service.from('scores').insert({
    performance_id: perf.id,
    ...payload.score,
    ai_breakdown: payload.score.ai_breakdown as unknown as Json,
  });
  if (scoreError) {
    console.error(`[performances] score insert failed for ${perf.id}; rolling back`, scoreError);
    // Roll back via the service role (performances has no user DELETE policy).
    const { error: rollbackError } = await service.from('performances').delete().eq('id', perf.id);
    if (rollbackError) {
      console.error(
        `[performances] ROLLBACK FAILED — orphaned scoreless performance ${perf.id}`,
        rollbackError,
      );
    }
    return Response.json({ error: 'Could not score performance' }, { status: 500 });
  }

  return Response.json({ id: perf.id }, { status: 201 });
}

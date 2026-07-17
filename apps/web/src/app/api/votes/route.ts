import { isRankedScoreStatus, voteSchema } from '@voxscore/core';
import { CRITERIA } from '@voxscore/scoring';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';
import { grantBadge } from '@/lib/badges';
import { notifyServer } from '@/lib/notify';

function voteRpcFailure(error: { code?: string; message?: string } | null): Response {
  if (error?.code === '23505') {
    return Response.json({ error: 'You have already voted on this performance' }, { status: 409 });
  }
  const message = error?.message ?? '';
  if (message.includes('daily_vote_limit')) {
    return Response.json({ error: 'Daily voting limit reached' }, { status: 429 });
  }
  if (message.includes('vote_locked')) {
    return Response.json(
      { error: 'Your vote is final — ratings can only be revised for 24 hours' },
      { status: 409 },
    );
  }
  if (message.includes('verified_listen_required')) {
    return Response.json(
      { error: 'A completed Verified Listen is required to vote' },
      { status: 403 },
    );
  }
  if (message.includes('self_vote_forbidden')) {
    return Response.json({ error: 'You cannot vote on your own performance' }, { status: 403 });
  }
  if (message.includes('performance_not_found')) {
    return Response.json({ error: 'Performance not found' }, { status: 404 });
  }
  if (message.includes('criteria_incomplete')) {
    return Response.json(
      { error: 'Every applicable criterion must be rated before voting' },
      { status: 422 },
    );
  }
  console.error('[votes] atomic vote/recompute failed', { code: error?.code });
  return Response.json({ error: 'Could not record vote' }, { status: 500 });
}

export async function POST(req: Request): Promise<Response> {
  let rawBody: string;
  let json: unknown;
  try {
    rawBody = await req.text();
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = voteSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req, user.id, rawBody);
  if (bot) return bot;

  // Fast user-scoped checks provide clear errors. The atomic DB function
  // repeats every fairness check because this API layer is not a trust boundary.
  const { data: listen } = await supabase
    .from('verified_listens')
    .select('id, is_valid, user_id, performance_id')
    .eq('id', parsed.data.verifiedListenId)
    .maybeSingle();
  if (
    !listen ||
    listen.user_id !== user.id ||
    listen.performance_id !== parsed.data.performanceId ||
    !listen.is_valid
  ) {
    return Response.json(
      { error: 'A completed Verified Listen is required to vote' },
      { status: 403 },
    );
  }

  const { data: votedPerf } = await supabase
    .from('performances')
    .select('user_id, has_video')
    .eq('id', parsed.data.performanceId)
    .maybeSingle();
  if (!votedPerf) return Response.json({ error: 'Performance not found' }, { status: 404 });
  if (votedPerf.user_id === user.id) {
    return Response.json({ error: 'You cannot vote on your own performance' }, { status: 403 });
  }

  const requiredCriteria = CRITERIA.filter(
    (criterion) => votedPerf.has_video || criterion !== 'stagePresence',
  );
  if (requiredCriteria.some((criterion) => typeof parsed.data.ratings[criterion] !== 'number')) {
    return Response.json(
      { error: 'Every applicable criterion must be rated before voting' },
      { status: 422 },
    );
  }

  const daySince = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: recentVotes } = await supabase
    .from('criteria_ratings')
    .select('id', { count: 'exact', head: true })
    .eq('voter_id', user.id)
    .gt('created_at', daySince);
  if ((recentVotes ?? 0) >= 50) {
    return Response.json({ error: 'Daily voting limit reached' }, { status: 429 });
  }

  // No rating has been written yet. Without the privileged client, fail before
  // mutation so the user can safely retry later.
  const service = createSupabaseServiceClient();
  if (!service)
    return Response.json({ error: 'Scoring is temporarily unavailable' }, { status: 503 });

  const { data: scoreRow } = await service
    .from('scores')
    .select('initial_ai_score, score_status')
    .eq('performance_id', parsed.data.performanceId)
    .maybeSingle();

  // Votes blend on top of any ranked score (verified DSP measurement or the
  // clearly-labeled provisional estimate). Rows still unscored/mid-analysis
  // have no AI basis to blend against, so voting stays closed for them.
  if (scoreRow?.initial_ai_score === null || scoreRow?.initial_ai_score === undefined) {
    return Response.json({ error: 'An AI score is required before voting' }, { status: 409 });
  }
  if (!isRankedScoreStatus(scoreRow.score_status)) {
    return Response.json({ error: 'An AI score is required before voting' }, { status: 409 });
  }
  const storedInitial = scoreRow.initial_ai_score;

  // PostgreSQL inserts the rating and recomputes the denormalized score in the
  // same transaction. A recompute failure rolls the new rating back.
  const ratings = parsed.data.ratings;
  const { data: recomputed, error: recomputeError } = await service.rpc(
    'submit_vote_and_recompute',
    {
      p_voter_id: user.id,
      p_performance_id: parsed.data.performanceId,
      p_verified_listen_id: parsed.data.verifiedListenId,
      p_vocal_accuracy: ratings.vocalAccuracy ?? null,
      p_rhythm_timing: ratings.rhythmTiming ?? null,
      p_tone_quality: ratings.toneQuality ?? null,
      p_emotion_interpretation: ratings.emotionInterpretation ?? null,
      p_technical_skill: ratings.technicalSkill ?? null,
      p_pronunciation_diction: ratings.pronunciationDiction ?? null,
      p_recording_quality: ratings.recordingQuality ?? null,
      p_originality: ratings.originality ?? null,
      p_stage_presence: ratings.stagePresence ?? null,
      p_initial_ai_score: storedInitial,
      p_trend_baseline: storedInitial,
    },
  );
  const updated = recomputed?.[0];
  if (recomputeError || !updated) return voteRpcFailure(recomputeError);

  // These effects are idempotent/best-effort and happen only after the
  // authoritative transaction commits.
  const sideEffects = await Promise.allSettled([
    trackServer(service, 'vote_submitted', user.id, {
      performanceId: parsed.data.performanceId,
    }),
    notifyServer(service, votedPerf.user_id, 'new_vote', {
      performanceId: parsed.data.performanceId,
    }),
    ...(updated.verified_vote_count >= 100
      ? [grantBadge(service, votedPerf.user_id, 'centurion')]
      : []),
  ]);
  const rejectedEffects = sideEffects.filter((effect) => effect.status === 'rejected').length;
  if (rejectedEffects > 0) {
    console.error('[votes] post-commit side effect failed', { failures: rejectedEffects });
  }

  return Response.json(
    {
      ok: true,
      listenerScore: updated.listener_score,
      currentScore: updated.current_score,
      trendScore: updated.trend_score,
      verifiedVoteCount: updated.verified_vote_count,
    },
    { status: 201 },
  );
}

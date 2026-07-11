import {
  measuredAdjustedInitial,
  voteSchema,
  type MeasuredBreakdown,
} from '@voxscore/core';
import { CRITERIA, type Criterion } from '@voxscore/scoring';
import type { Database } from '@voxscore/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';
import { COLUMN } from './overall';

type CriteriaRatingInsert = Database['public']['Tables']['criteria_ratings']['Insert'];

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
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
  const bot = await botGuard(req);
  if (bot) return bot;

  // The listen must be valid, owned by the voter, and for this performance.
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

  // Fairness: a creator cannot rate their OWN performance (a self-vote would
  // seed 100s across every criterion). Owners always see their own row through
  // RLS, so this check is reliable exactly for the self-vote case.
  const { data: votedPerf } = await supabase
    .from('performances')
    .select('user_id, has_video')
    .eq('id', parsed.data.performanceId)
    .maybeSingle();
  if (!votedPerf) {
    return Response.json({ error: 'Performance not found' }, { status: 404 });
  }
  if (votedPerf.user_id === user.id) {
    return Response.json({ error: 'You cannot vote on your own performance' }, { status: 403 });
  }

  const requiredCriteria = CRITERIA.filter(
    (criterion) => votedPerf.has_video || criterion !== 'stagePresence',
  );
  const missingCriteria = requiredCriteria.filter(
    (criterion) => typeof parsed.data.ratings[criterion] !== 'number',
  );
  if (missingCriteria.length > 0) {
    return Response.json(
      { error: 'Every applicable criterion must be rated before voting' },
      { status: 422 },
    );
  }

  // Map camelCase ratings → snake_case columns.
  const ratingColumns: Record<string, number> = {};
  for (const c of CRITERIA) {
    const v = parsed.data.ratings[c];
    if (typeof v === 'number') ratingColumns[COLUMN[c]] = v;
  }

  // Insert the rating AS THE USER (RLS re-verifies the verified listen).
  const insertPayload = {
    performance_id: parsed.data.performanceId,
    voter_id: user.id,
    verified_listen_id: parsed.data.verifiedListenId,
    ...ratingColumns,
  } as unknown as CriteriaRatingInsert;
  const { error: insertError } = await supabase.from('criteria_ratings').insert(insertPayload);

  if (insertError) {
    // Unique(voter_id, performance_id) violation → already voted.
    return Response.json({ error: 'You have already voted on this performance' }, { status: 409 });
  }

  // Recompute the denormalized score via service role (scores are server-only).
  const service = createSupabaseServiceClient();
  if (service) {
    const { data: scoreRow } = await service
      .from('scores')
      .select('initial_ai_score, ai_breakdown')
      .eq('performance_id', parsed.data.performanceId)
      .maybeSingle();

    // A real measurement (ADR 0003) replaces the LLM estimate for the
    // measured criteria in the blend basis; absent one, the estimate stands.
    const { data: measuredRow } = await service
      .from('measured_scores')
      .select('measured_breakdown')
      .eq('performance_id', parsed.data.performanceId)
      .maybeSingle();

    if (scoreRow?.initial_ai_score === null || scoreRow?.initial_ai_score === undefined) {
      return Response.json({ error: 'Score row not found' }, { status: 500 });
    }
    const storedInitial = scoreRow.initial_ai_score;
    const initialAiScore = measuredRow
      ? (measuredAdjustedInitial({
          aiBreakdown: scoreRow.ai_breakdown as Partial<Record<Criterion, number>> | null,
          measured: measuredRow.measured_breakdown as MeasuredBreakdown,
          hasVideo: votedPerf.has_video,
        }) ?? storedInitial)
      : storedInitial;

    const { data: recomputed, error: recomputeError } = await service.rpc(
      'recompute_performance_score',
      {
        p_performance_id: parsed.data.performanceId,
        p_initial_ai_score: initialAiScore,
        p_trend_baseline: storedInitial,
      },
    );
    const updated = recomputed?.[0];
    if (recomputeError || !updated) {
      console.error('[votes] score recompute failed', recomputeError);
      return Response.json({ error: 'Could not recompute score' }, { status: 500 });
    }

    await trackServer(service, 'vote_submitted', user.id, {
      performanceId: parsed.data.performanceId,
    });

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

  return Response.json({ ok: true }, { status: 201 });
}

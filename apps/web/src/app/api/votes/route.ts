import { criteriaOverall, recomputeScore, voteSchema } from '@voxscore/core';
import { CRITERIA, type Criterion } from '@voxscore/scoring';
import type { Database } from '@voxscore/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';

type CriteriaRatingInsert = Database['public']['Tables']['criteria_ratings']['Insert'];

/** Criterion (camelCase) → criteria_ratings column (snake_case). */
const COLUMN: Record<Criterion, string> = {
  vocalAccuracy: 'vocal_accuracy',
  rhythmTiming: 'rhythm_timing',
  toneQuality: 'tone_quality',
  emotionInterpretation: 'emotion_interpretation',
  technicalSkill: 'technical_skill',
  pronunciationDiction: 'pronunciation_diction',
  recordingQuality: 'recording_quality',
  originality: 'originality',
  stagePresence: 'stage_presence',
};

function rowToOverall(row: unknown): number | null {
  const r = row as Record<string, unknown>;
  const ratings: Partial<Record<Criterion, number>> = {};
  for (const c of CRITERIA) {
    const v = r[COLUMN[c]];
    if (typeof v === 'number') ratings[c] = v;
  }
  return criteriaOverall(ratings);
}

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
      .select('initial_ai_score')
      .eq('performance_id', parsed.data.performanceId)
      .maybeSingle();

    const { data: ratings } = await service
      .from('criteria_ratings')
      .select('*')
      .eq('performance_id', parsed.data.performanceId);

    const initialAiScore = scoreRow?.initial_ai_score ?? 0;
    const voteOveralls = (ratings ?? [])
      .map((r) => rowToOverall(r))
      .filter((v): v is number => v !== null);

    const updated = recomputeScore({ initialAiScore, voteOveralls });

    await service
      .from('scores')
      .update({
        listener_score: updated.listenerScore,
        current_score: updated.currentScore,
        trend_score: updated.trendScore,
        verified_vote_count: updated.verifiedVoteCount,
      })
      .eq('performance_id', parsed.data.performanceId);

    return Response.json({ ok: true, ...updated }, { status: 201 });
  }

  return Response.json({ ok: true }, { status: 201 });
}

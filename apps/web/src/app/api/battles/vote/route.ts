import { battleVoteSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = battleVoteSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });
  const { battleId, winnerPerformanceId, listenAId, listenBId } = parsed.data;

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const { data: battle } = await supabase
    .from('battles')
    .select('id, perf_a, perf_b')
    .eq('id', battleId)
    .maybeSingle();
  if (!battle) return Response.json({ error: 'Battle not found' }, { status: 404 });

  if (winnerPerformanceId !== battle.perf_a && winnerPerformanceId !== battle.perf_b) {
    return Response.json({ error: 'Winner must be one of the two performances' }, { status: 422 });
  }

  // Both listens must be valid, owned by the voter, and cover the two sides.
  const { data: listens } = await supabase
    .from('verified_listens')
    .select('id, is_valid, user_id, performance_id')
    .in('id', [listenAId, listenBId]);

  const listenA = listens?.find((l) => l.id === listenAId);
  const listenB = listens?.find((l) => l.id === listenBId);
  const ok =
    listenA &&
    listenB &&
    listenA.is_valid &&
    listenB.is_valid &&
    listenA.user_id === user.id &&
    listenB.user_id === user.id &&
    listenA.performance_id === battle.perf_a &&
    listenB.performance_id === battle.perf_b;

  if (!ok) {
    return Response.json(
      { error: 'A completed Verified Listen on BOTH performances is required' },
      { status: 403 },
    );
  }

  // Record the vote AS THE USER (RLS re-verifies both listens).
  const { error: insertError } = await supabase.from('battle_votes').insert({
    battle_id: battleId,
    voter_id: user.id,
    winner_performance_id: winnerPerformanceId,
    listen_a_id: listenAId,
    listen_b_id: listenBId,
    is_verified: true,
  });
  if (insertError) {
    return Response.json({ error: 'You have already voted in this battle' }, { status: 409 });
  }

  // Apply the Elo update + win/battle counters ATOMICALLY. apply_battle_result
  // locks BOTH performance rows, recomputes Elo (mirrors @voxscore/scoring), and
  // increments the counters in one transaction — so concurrent battle votes that
  // share a performance can no longer lose updates (the old JS read-modify-write
  // race that leaked Elo points and undercounted battles).
  const service = createSupabaseServiceClient();
  if (service) {
    const resultForA = winnerPerformanceId === battle.perf_a ? 1 : 0;
    const { data: applied } = await service.rpc('apply_battle_result', {
      p_perf_a: battle.perf_a,
      p_perf_b: battle.perf_b,
      p_result_for_a: resultForA,
    });
    const row = applied?.[0];
    if (row) {
      return Response.json(
        { ok: true, ratingA: row.rating_a, ratingB: row.rating_b },
        { status: 201 },
      );
    }
  }

  return Response.json({ ok: true }, { status: 201 });
}

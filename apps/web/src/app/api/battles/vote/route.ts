import { battleVoteSchema } from '@vocal-league/core';
import { applyBattle } from '@vocal-league/scoring';
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

  // Update Elo ratings + win counts via service role.
  const service = createSupabaseServiceClient();
  if (service) {
    const { data: perfs } = await service
      .from('performances')
      .select('id, elo_rating, battle_wins, battle_count')
      .in('id', [battle.perf_a, battle.perf_b]);

    const a = perfs?.find((p) => p.id === battle.perf_a);
    const b = perfs?.find((p) => p.id === battle.perf_b);
    if (a && b) {
      const resultForA = winnerPerformanceId === battle.perf_a ? 1 : 0;
      const { ratingA, ratingB } = applyBattle(a.elo_rating, b.elo_rating, resultForA);

      await service
        .from('performances')
        .update({
          elo_rating: ratingA,
          battle_count: a.battle_count + 1,
          battle_wins: a.battle_wins + (resultForA === 1 ? 1 : 0),
        })
        .eq('id', battle.perf_a);
      await service
        .from('performances')
        .update({
          elo_rating: ratingB,
          battle_count: b.battle_count + 1,
          battle_wins: b.battle_wins + (resultForA === 0 ? 1 : 0),
        })
        .eq('id', battle.perf_b);

      return Response.json({ ok: true, ratingA, ratingB }, { status: 201 });
    }
  }

  return Response.json({ ok: true }, { status: 201 });
}

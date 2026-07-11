import { battleVoteSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';

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
    .select('id, perf_a, perf_b, status')
    .eq('id', battleId)
    .maybeSingle();
  if (!battle) return Response.json({ error: 'Battle not found' }, { status: 404 });
  if (battle.status === 'closed') {
    return Response.json({ error: 'Battle already closed' }, { status: 409 });
  }

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

  // Elo is NOT applied per vote anymore. The close-battles cron applies ONE
  // margin-weighted apply_battle_result per battle when it closes (24h after
  // creation) — N voters no longer mean N full K-factor swings.
  const service = createSupabaseServiceClient();
  if (service) {
    await trackServer(service, 'battle_completed', user.id, { battleId });
  }

  return Response.json({ ok: true }, { status: 201 });
}

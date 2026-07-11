import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { grantBadge } from '@/lib/badges';

/** A battle collects votes for this long, then closes with ONE Elo update. */
const BATTLE_WINDOW_H = 24;
/** Bounds one cron invocation's work; the next run drains any remainder. */
const BATCH = 50;
/** Higher K while a performance is establishing its rating, then settle. */
const K_PROVISIONAL = 48;
const K_ESTABLISHED = 24;
const PROVISIONAL_BATTLES = 5;

/**
 * Close battles older than the window: ONE margin-weighted Elo update per
 * battle (result_for_a = verified votes for A / total), instead of the old
 * per-vote full-K updates that let popular battles swing ratings N times.
 * Zero-vote battles close silently with no rating change. Same auth contract
 * as the other crons: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const cutoff = new Date(Date.now() - BATTLE_WINDOW_H * 3600_000).toISOString();
  const { data: stale, error } = await service
    .from('battles')
    .select('id, perf_a, perf_b')
    .eq('status', 'open')
    .lt('created_at', cutoff)
    .limit(BATCH);
  if (error) return Response.json({ error: 'Could not load battles' }, { status: 500 });

  let closed = 0;
  let applied = 0;
  for (const b of stale ?? []) {
    const { data: votes } = await service
      .from('battle_votes')
      .select('winner_performance_id')
      .eq('battle_id', b.id)
      .eq('is_verified', true);
    const total = votes?.length ?? 0;

    if (total > 0) {
      const votesA = (votes ?? []).filter((v) => v.winner_performance_id === b.perf_a).length;
      const resultForA = votesA / total;

      const { data: perfs } = await service
        .from('performances')
        .select('id, user_id, battle_count')
        .in('id', [b.perf_a, b.perf_b]);
      const a = perfs?.find((p) => p.id === b.perf_a);
      const pB = perfs?.find((p) => p.id === b.perf_b);
      const k =
        Math.min(a?.battle_count ?? 0, pB?.battle_count ?? 0) < PROVISIONAL_BATTLES
          ? K_PROVISIONAL
          : K_ESTABLISHED;

      await service.rpc('apply_battle_result', {
        p_perf_a: b.perf_a,
        p_perf_b: b.perf_b,
        p_result_for_a: resultForA,
        p_k: k,
      });
      applied++;

      if (resultForA !== 0.5) {
        const winnerOwner = resultForA > 0.5 ? a?.user_id : pB?.user_id;
        if (winnerOwner) await grantBadge(service, winnerOwner, 'battle_champion');
      }
    }

    await service
      .from('battles')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', b.id);
    closed++;
  }

  return Response.json({ closed, applied });
}

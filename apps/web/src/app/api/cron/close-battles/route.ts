import { createSupabaseServiceClient } from '@/lib/supabase/server';

/** A battle collects votes for this long, then closes with ONE Elo update. */
const BATTLE_WINDOW_H = 24;
/** Bounds one cron invocation's work; the next run drains any remainder. */
const BATCH = 50;

/**
 * Close stale battles through one DB transaction per battle. The RPC owns the
 * row lock, Elo, prediction settlement, badge/league reward, persisted result,
 * and final status change. Retried or concurrent crons therefore cannot apply
 * Elo twice.
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
  let failed = 0;
  for (const battle of stale ?? []) {
    const { data, error: closeError } = await service.rpc('close_battle_atomic', {
      p_battle_id: battle.id,
      p_cutoff: cutoff,
    });
    if (closeError) {
      failed++;
      console.error('[close-battles] atomic close failed', { battleId: battle.id });
      continue;
    }
    const result = data?.[0];
    if (result?.closed) closed++;
    if (result?.applied) applied++;
  }

  return Response.json({ closed, applied, failed }, { status: failed > 0 ? 500 : 200 });
}

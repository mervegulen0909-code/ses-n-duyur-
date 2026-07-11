import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { reputationFromMad } from '@/lib/reputation';
import { COLUMN, rowToOverall } from '@/app/api/votes/overall';
import { CRITERIA } from '@voxscore/scoring';

/** A performance's listener score only counts as consensus past this many votes. */
const MIN_CONSENSUS_VOTES = 5;
/** Never refit a voter's reputation on fewer consensus comparisons than this. */
const MIN_COMPARISONS = 3;
/** Bounds one cron invocation's writes; the next nightly run picks up the rest. */
const VOTER_BATCH = 200;

const RATING_COLUMNS = CRITERIA.map((c) => COLUMN[c]).join(', ');

/**
 * Nightly voter-reputation refit (T9). For every voter with enough votes on
 * performances that have a consensus listener score, measure how far their
 * overalls sit from that consensus (mean absolute deviation) and store the
 * resulting trust weight ×1000 in profiles.reputation. New votes then carry
 * criteria_ratings.weight = that voter's weight. Same auth contract as the
 * other crons: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: consensusRows, error: consensusError } = await service
    .from('scores')
    .select('performance_id, listener_score')
    .gte('verified_vote_count', MIN_CONSENSUS_VOTES)
    .not('listener_score', 'is', null);
  if (consensusError) {
    return Response.json({ error: 'Could not load consensus scores' }, { status: 500 });
  }
  const consensus = new Map(
    (consensusRows ?? []).map((r) => [r.performance_id, Number(r.listener_score)]),
  );
  if (consensus.size === 0) return Response.json({ voters: 0, updated: 0 });

  const { data: ratings, error: ratingsError } = await service
    .from('criteria_ratings')
    .select(`voter_id, performance_id, ${RATING_COLUMNS}`)
    .in('performance_id', [...consensus.keys()]);
  if (ratingsError) {
    return Response.json({ error: 'Could not load ratings' }, { status: 500 });
  }

  // Per voter: |voter overall − consensus listener score| for each rated
  // performance, using the SAME criterion-weighted overall the RPC aggregates.
  const deviations = new Map<string, number[]>();
  for (const row of (ratings ?? []) as unknown as Record<string, unknown>[]) {
    const voterId = row.voter_id as string;
    const target = consensus.get(row.performance_id as string);
    const overall = rowToOverall(row);
    if (target === undefined || overall === null) continue;
    const list = deviations.get(voterId) ?? [];
    list.push(Math.abs(overall - target));
    deviations.set(voterId, list);
  }

  const voters = [...deviations.entries()]
    .filter(([, list]) => list.length >= MIN_COMPARISONS)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, VOTER_BATCH);

  let updated = 0;
  for (const [voterId, list] of voters) {
    const mad = list.reduce((s, d) => s + d, 0) / list.length;
    const { error: updateError } = await service
      .from('profiles')
      .update({ reputation: reputationFromMad(mad) })
      .eq('id', voterId);
    if (updateError) {
      console.error('[refresh-reputation] update failed', voterId, updateError);
      continue;
    }
    updated++;
  }

  return Response.json({ voters: voters.length, updated });
}

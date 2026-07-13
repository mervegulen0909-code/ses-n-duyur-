import 'server-only';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** The five numbers on the /wrapped recap card. */
export interface WrappedData {
  battlesWon: number;
  battlesLost: number;
  votesCast: number;
  validListens: number;
  predictionPoints: number;
}

const ZERO: WrappedData = {
  battlesWon: 0,
  battlesLost: 0,
  votesCast: 0,
  validListens: 0,
  predictionPoints: 0,
};

interface SeasonWindow {
  starts_at: string;
  ends_at: string | null;
}

/**
 * Season-scoped W-L record for the user's performances. `battles` has no
 * persisted winner column — the close cron derives the winner from verified
 * votes at close time (majority; 0.5 = tie, no winner) — so we re-derive it
 * here with the exact same rule over this season's CLOSED battles.
 */
async function battleRecord(
  service: ServiceClient,
  userId: string,
  seasonId: string,
): Promise<Pick<WrappedData, 'battlesWon' | 'battlesLost'>> {
  const none = { battlesWon: 0, battlesLost: 0 };

  const { data: perfs } = await service.from('performances').select('id').eq('user_id', userId);
  const mine = new Set((perfs ?? []).map((p) => p.id));
  if (mine.size === 0) return none;

  const list = [...mine].join(',');
  const { data: battles } = await service
    .from('battles')
    .select('id, perf_a, perf_b')
    .eq('status', 'closed')
    .eq('season_id', seasonId)
    .or(`perf_a.in.(${list}),perf_b.in.(${list})`);
  if (!battles || battles.length === 0) return none;

  const { data: votes } = await service
    .from('battle_votes')
    .select('battle_id, winner_performance_id')
    .in(
      'battle_id',
      battles.map((b) => b.id),
    )
    .eq('is_verified', true);

  const battleById = new Map(battles.map((b) => [b.id, b]));
  const tallies = new Map<string, { forA: number; total: number }>();
  for (const v of votes ?? []) {
    const battle = battleById.get(v.battle_id);
    if (!battle) continue;
    const t = tallies.get(v.battle_id) ?? { forA: 0, total: 0 };
    t.total += 1;
    if (v.winner_performance_id === battle.perf_a) t.forA += 1;
    tallies.set(v.battle_id, t);
  }

  let battlesWon = 0;
  let battlesLost = 0;
  for (const [battleId, t] of tallies) {
    const resultForA = t.forA / t.total;
    if (resultForA === 0.5) continue; // tie — the cron crowns no winner
    const battle = battleById.get(battleId)!;
    const winner = resultForA > 0.5 ? battle.perf_a : battle.perf_b;
    if (mine.has(winner)) battlesWon += 1;
    else battlesLost += 1;
  }
  return { battlesWon, battlesLost };
}

/**
 * Count `table` rows for this user inside the season window. Tables without a
 * season_id column are date-bounded instead: created_at >= starts_at, and
 * <= ends_at only once the season has closed (an open season has no upper end).
 */
async function seasonCount(
  service: ServiceClient,
  table: 'battle_votes' | 'verified_listens',
  filters: Record<string, string | boolean>,
  season: SeasonWindow,
): Promise<number> {
  let query = service.from(table).select('id', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  query = query.gte('created_at', season.starts_at);
  if (season.ends_at) query = query.lte('created_at', season.ends_at);
  const { count } = await query;
  return count ?? 0;
}

/**
 * Assemble the /wrapped recap for one user and season. Every stat is
 * season-scoped except predictionPoints, which is the profile's ALL-TIME
 * tally (the card labels it plainly, without a season qualifier).
 * `seasonId` comes from `currentSeasonId()` and is null when seasons aren't
 * in use yet — that (or a vanished season row) degrades to all-zeros rather
 * than erroring, so the page always renders.
 */
export async function buildWrappedData(
  service: ServiceClient,
  userId: string,
  seasonId: string | null,
): Promise<WrappedData> {
  if (!seasonId) return { ...ZERO };

  const { data: season } = await service
    .from('seasons')
    .select('starts_at, ends_at')
    .eq('id', seasonId)
    .maybeSingle();
  if (!season) return { ...ZERO };

  const { battlesWon, battlesLost } = await battleRecord(service, userId, seasonId);
  const votesCast = await seasonCount(
    service,
    'battle_votes',
    { voter_id: userId, is_verified: true },
    season,
  );
  const validListens = await seasonCount(
    service,
    'verified_listens',
    { user_id: userId, is_valid: true },
    season,
  );
  const { data: profile } = await service
    .from('profiles')
    .select('prediction_points')
    .eq('id', userId)
    .maybeSingle();

  return {
    battlesWon,
    battlesLost,
    votesCast,
    validListens,
    predictionPoints: profile?.prediction_points ?? 0,
  };
}

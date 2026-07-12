import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@voxscore/db';
import { RankBadge } from '@/components/rank-badge';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { SeasonSwitcher } from '@/components/season-switcher';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankByElo, winRate, type StandingsRow } from '@/lib/leaderboard';
import { listSeasons, resolveSeason, type SeasonSummary } from '@/lib/seasons';

export const dynamic = 'force-dynamic';

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? '';
}

/**
 * Season-scoped W-L/battle-count, built from raw `battles`/`battle_votes`
 * rows tagged to this season. Elo itself is a running rating that a season
 * boundary never resets (see the seasons migration) — only the "battles
 * fought during this window" record can be season-scoped, so the number
 * shown alongside it is still the performance's CURRENT (all-time) rating.
 */
async function seasonStandingsRows(
  supabase: SupabaseClient<Database>,
  season: SeasonSummary,
  perfs: readonly { id: string; oembed_meta: unknown; elo_rating: number }[],
): Promise<StandingsRow[]> {
  const { data: battles } = await supabase
    .from('battles')
    .select('id, perf_a, perf_b')
    .eq('season_id', season.id);
  const battleIds = (battles ?? []).map((b) => b.id);
  const { data: votes } = battleIds.length
    ? await supabase
        .from('battle_votes')
        .select('battle_id, winner_performance_id')
        .in('battle_id', battleIds)
    : { data: [] };

  const battleById = new Map((battles ?? []).map((b) => [b.id, b]));
  const battlesByPerf = new Map<string, number>();
  const winsByPerf = new Map<string, number>();
  // One battle_votes row = one apply_battle_result call = +1 battle for BOTH
  // sides (mirrors performances.battle_count, which counts votes, not pairings).
  for (const v of votes ?? []) {
    const b = battleById.get(v.battle_id);
    if (!b) continue;
    battlesByPerf.set(b.perf_a, (battlesByPerf.get(b.perf_a) ?? 0) + 1);
    battlesByPerf.set(b.perf_b, (battlesByPerf.get(b.perf_b) ?? 0) + 1);
    winsByPerf.set(v.winner_performance_id, (winsByPerf.get(v.winner_performance_id) ?? 0) + 1);
  }

  return perfs
    .filter((p) => battlesByPerf.has(p.id))
    .map((p) => ({
      id: p.id,
      title: titleOf(p.oembed_meta),
      elo: p.elo_rating,
      wins: winsByPerf.get(p.id) ?? 0,
      battles: battlesByPerf.get(p.id) ?? 0,
    }));
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-bold">{t('Standings.title')}</h1>
        <p className="text-neutral-400">{t('Common.supabaseNotConfigured')}</p>
      </main>
    );
  }

  const { data: perfs } = await supabase
    .from('performances')
    .select('id, oembed_meta, elo_rating, battle_wins, battle_count')
    .eq('status', 'active');

  const seasons = await listSeasons(supabase);
  const activeSeason = resolveSeason(seasons, season);

  // Prediction League: the listener game's own board (all-time points).
  // Predictions are NOT votes — this list never feeds Elo or scores.
  const { data: predictors } = await supabase
    .from('profiles')
    .select('id, handle, prediction_points')
    .gt('prediction_points', 0)
    .order('prediction_points', { ascending: false })
    .limit(50);

  const rows: StandingsRow[] = activeSeason
    ? await seasonStandingsRows(supabase, activeSeason, perfs ?? [])
    : (perfs ?? [])
        .filter((p) => p.battle_count > 0)
        .map((p) => ({
          id: p.id,
          title: titleOf(p.oembed_meta),
          elo: p.elo_rating,
          wins: p.battle_wins,
          battles: p.battle_count,
        }));
  const ranked = rankByElo(rows);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <RealtimeRefresh table="performances" />
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('Standings.title')}</h1>
        <Link href="/leaderboard" className="text-sm text-neutral-400 hover:text-neutral-200">
          {t('Standings.viewScores')}
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-400">{t('Standings.subtitle')}</p>

      <div className="mb-6">
        <SeasonSwitcher
          seasons={seasons}
          activeKey={activeSeason?.key ?? 'all'}
          basePath="/standings"
        />
      </div>

      {ranked.length === 0 ? (
        <p className="text-neutral-400">{t('Standings.empty')}</p>
      ) : (
        <ol className="space-y-2">
          {ranked.map((r, i) => (
            <li key={r.id}>
              <Link
                href={`/performance/${r.id}`}
                className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600"
              >
                <RankBadge rank={i + 1} />
                <span className="flex-1 truncate text-sm">
                  {r.title || t('Common.untitledPerformance')}
                </span>
                <span className="hidden text-xs text-neutral-500 sm:inline">
                  {t('Standings.record', { wins: r.wins, losses: r.battles - r.wins })}
                </span>
                <span className="hidden w-16 text-right text-xs text-neutral-500 sm:inline">
                  {t('Standings.winRate', { rate: winRate(r.wins, r.battles) })}
                </span>
                <span className="w-14 text-right font-semibold tabular-nums text-emerald-400">
                  {Math.round(r.elo)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {(predictors?.length ?? 0) > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">{t('Standings.predictionLeague')}</h2>
          <ol className="space-y-2">
            {(predictors ?? []).map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/profile/${p.handle}`}
                  className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600"
                >
                  <RankBadge rank={i + 1} />
                  <span className="flex-1 truncate text-sm">@{p.handle}</span>
                  <span className="w-14 text-right font-semibold tabular-nums text-sky-400">
                    {p.prediction_points}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { wilsonLowerBound } from '@voxscore/scoring';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankByScore, type LeaderboardRow } from '@/lib/leaderboard';
import { RankBadge } from '@/components/rank-badge';
import { TrendTag } from '@/components/trend-tag';

export const dynamic = 'force-dynamic';

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? '';
}

export default async function LeaderboardPage() {
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-bold">{t('Nav.leaderboard')}</h1>
        <p className="text-neutral-400">{t('Common.supabaseNotConfigured')}</p>
      </main>
    );
  }

  const { data: perfs } = await supabase
    .from('performances')
    .select('id, oembed_meta, battle_wins, battle_count')
    .eq('status', 'active');

  const { data: scores } = await supabase
    .from('scores')
    .select('performance_id, current_score, trend_score, is_provisional');

  const scoreByPerf = new Map((scores ?? []).map((s) => [s.performance_id, s]));

  const rows: LeaderboardRow[] = (perfs ?? []).map((p) => {
    const s = scoreByPerf.get(p.id);
    return {
      id: p.id,
      title: titleOf(p.oembed_meta),
      currentScore: s?.current_score ?? null,
      trendScore: s?.trend_score ?? null,
      isProvisional: s?.is_provisional ?? true,
      wins: p.battle_wins,
      battles: p.battle_count,
      wilson: wilsonLowerBound(p.battle_wins, p.battle_count),
    };
  });
  const ranked = rankByScore(rows);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <RealtimeRefresh table="scores" />
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('Nav.leaderboard')}</h1>
        <Link href="/standings" className="text-sm text-neutral-400 hover:text-neutral-200">
          {t('Leaderboard.viewStandings')}
        </Link>
      </div>
      <p className="mb-6 text-sm text-neutral-400">{t('Leaderboard.subtitle')}</p>

      {ranked.length === 0 ? (
        <p className="text-neutral-400">{t('Common.noPerformances')}</p>
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
                {r.isProvisional && <ProvisionalBadge />}
                {r.battles > 0 && (
                  <span className="hidden text-xs text-neutral-500 sm:inline">
                    {t('Leaderboard.battleRecord', { wins: r.wins, losses: r.battles - r.wins })}
                  </span>
                )}
                <TrendTag trend={r.trendScore} />
                <span className="w-12 text-right font-semibold tabular-nums">
                  {r.currentScore === null ? '—' : r.currentScore.toFixed(1)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

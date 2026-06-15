import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RankBadge } from '@/components/rank-badge';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankByElo, winRate, type StandingsRow } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? '';
}

export default async function StandingsPage() {
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

  const rows: StandingsRow[] = (perfs ?? [])
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
      <p className="mb-6 text-sm text-neutral-400">{t('Standings.subtitle')}</p>

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
    </main>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { wilsonLowerBound } from '@voxscore/scoring';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { ShareButtons } from '@/components/share-buttons';
import { ChallengeSection } from '@/components/challenge-section';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankByScore, type LeaderboardRow } from '@/lib/leaderboard';
import { RankBadge } from '@/components/rank-badge';
import { TrendTag } from '@/components/trend-tag';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? '';
}

/**
 * Per-song ranking — the product's core promise: "who sings THIS song best".
 * Same ranking math as the global leaderboard, scoped to one song_id.
 */
export default async function SongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { id } = await params;
  const { challenge } = await searchParams;
  const t = await getTranslations();
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const { data: song } = await supabase
    .from('songs')
    .select('id, title, artist')
    .eq('id', id)
    .maybeSingle();
  if (!song) notFound();

  const { data: perfs } = await supabase
    .from('performances')
    .select('id, oembed_meta, battle_wins, battle_count')
    .eq('song_id', id)
    .eq('status', 'active');

  const perfIds = (perfs ?? []).map((p) => p.id);
  const { data: scores } = perfIds.length
    ? await supabase
        .from('scores')
        .select('performance_id, current_score, trend_score, is_provisional')
        .in('performance_id', perfIds)
    : { data: [] };

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
        <h1 className="text-2xl font-bold">
          {song.title}
          {song.artist && <span className="font-normal text-neutral-400"> — {song.artist}</span>}
        </h1>
        <Link href="/leaderboard" className="text-sm text-neutral-400 hover:text-neutral-200">
          {t('Nav.leaderboard')}
        </Link>
      </div>
      <p className="mb-2 text-sm text-neutral-400">{t('Song.subtitle')}</p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/song/${id}?challenge=1`}
          className="text-sm font-medium text-emerald-400 hover:underline"
        >
          {t('Song.battleThisSong')}
        </Link>
      </div>

      {challenge === '1' && (
        <div className="mb-8">
          <ChallengeSection songId={id} isSignedIn={!!user} />
          <div className="mt-3">
            <ShareButtons url={`/song/${id}?challenge=1`} title={t('Song.challengeCta')} />
          </div>
        </div>
      )}

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

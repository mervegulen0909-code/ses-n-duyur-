import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { wilsonLowerBound } from '@voxscore/scoring';
import { isSongCategory } from '@voxscore/core';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { CategoryChips } from '@/components/category-chips';
import { SeasonSwitcher } from '@/components/season-switcher';
import { LeaderboardList, type LeaderboardDisplayRow } from '@/components/leaderboard-list';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankByScore, type LeaderboardRow } from '@/lib/leaderboard';
import { listSeasons, resolveSeason } from '@/lib/seasons';

export const dynamic = 'force-dynamic';

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? '';
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; season?: string }>;
}) {
  const { category, season } = await searchParams;
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
    .select('id, oembed_meta, battle_wins, battle_count, song_id, created_at')
    .eq('status', 'active');

  const seasons = await listSeasons(supabase);
  const activeSeason = resolveSeason(seasons, season);
  let scoresQuery = supabase
    .from('scores')
    .select('performance_id, current_score, trend_score, is_provisional, verified_vote_count')
    .eq('score_status', 'ai_verified');
  if (activeSeason) scoresQuery = scoresQuery.eq('season_id', activeSeason.id);
  const { data: scores } = await scoresQuery;

  const activeCategory = isSongCategory(category) ? category : null;
  const songIds = [
    ...new Set((perfs ?? []).map((p) => p.song_id).filter((id): id is string => !!id)),
  ];
  const { data: songs } = songIds.length
    ? await supabase.from('songs').select('id, category').in('id', songIds)
    : { data: [] };
  const categoryBySong = new Map((songs ?? []).map((s) => [s.id, s.category]));

  const scoreByPerf = new Map((scores ?? []).map((s) => [s.performance_id, s]));

  const categoryFilteredPerfs = activeCategory
    ? (perfs ?? []).filter((p) => p.song_id && categoryBySong.get(p.song_id) === activeCategory)
    : (perfs ?? []);
  const perfsInCategory = categoryFilteredPerfs.filter((performance) =>
    scoreByPerf.has(performance.id),
  );

  const rows: LeaderboardRow[] = perfsInCategory.map((p) => {
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
  const displayRows: LeaderboardDisplayRow[] = ranked.map((r) => {
    const p = perfsInCategory.find((x) => x.id === r.id)!;
    return {
      ...r,
      verifiedVoteCount: scoreByPerf.get(r.id)?.verified_vote_count ?? 0,
      createdAt: p.created_at,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <RealtimeRefresh table="scores" />
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('Nav.leaderboard')}</h1>
        <Link href="/standings" className="text-sm text-neutral-400 hover:text-neutral-200">
          {t('Leaderboard.viewStandings')}
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-400">{t('Leaderboard.subtitle')}</p>

      <div className="mb-3">
        <SeasonSwitcher
          seasons={seasons}
          activeKey={activeSeason?.key ?? 'all'}
          basePath="/leaderboard"
          extraParams={{ category: activeCategory ?? undefined }}
        />
      </div>

      <div className="mb-6">
        <CategoryChips active={activeCategory ?? undefined} />
      </div>

      {displayRows.length === 0 && !activeCategory ? (
        <p className="text-neutral-400">{t('Common.noPerformances')}</p>
      ) : (
        <LeaderboardList rows={displayRows} />
      )}
    </main>
  );
}

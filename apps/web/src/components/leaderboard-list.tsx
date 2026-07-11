'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ProvisionalBadge } from './provisional-badge';
import { RankBadge } from './rank-badge';
import { TrendTag } from './trend-tag';

export interface LeaderboardDisplayRow {
  id: string;
  title: string;
  currentScore: number | null;
  trendScore: number | null;
  isProvisional: boolean;
  wins: number;
  battles: number;
  verifiedVoteCount: number;
  createdAt: string;
}

type SortKey = 'score' | 'battles' | 'newest';

function sorted(rows: LeaderboardDisplayRow[], sort: SortKey): LeaderboardDisplayRow[] {
  const copy = [...rows];
  if (sort === 'battles') return copy.sort((a, b) => b.battles - a.battles);
  if (sort === 'newest') {
    return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  // 'score': rows arrive already score-ranked by the server (rankByScore).
  return copy;
}

export function LeaderboardList({ rows }: { rows: LeaderboardDisplayRow[] }) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('score');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
    return sorted(filtered, sort);
  }, [rows, query, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Leaderboard.searchPlaceholder')}
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
        >
          <option value="score">{t('Leaderboard.sortScore')}</option>
          <option value="battles">{t('Leaderboard.sortBattles')}</option>
          <option value="newest">{t('Leaderboard.sortNewest')}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-neutral-400">{t('Leaderboard.noResults')}</p>
      ) : (
        <ol className="space-y-2">
          {visible.map((r, i) => {
            const zeroVotes = r.verifiedVoteCount === 0;
            return (
              <li key={r.id}>
                <Link
                  href={`/performance/${r.id}`}
                  className={`flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600 ${zeroVotes ? 'opacity-70' : ''}`}
                >
                  <RankBadge rank={i + 1} />
                  <span className="flex-1 truncate text-sm">
                    {r.title || t('Common.untitledPerformance')}
                  </span>
                  {r.isProvisional && <ProvisionalBadge />}
                  <span className="hidden text-xs text-neutral-500 sm:inline">
                    {t('Performance.verifiedVotes', { count: r.verifiedVoteCount })}
                  </span>
                  {r.battles > 0 && (
                    <span className="hidden text-xs text-neutral-500 sm:inline">
                      {t('Leaderboard.battleRecord', { wins: r.wins, losses: r.battles - r.wins })}
                    </span>
                  )}
                  <TrendTag trend={r.trendScore} />
                  <span
                    className={`w-12 text-right font-semibold tabular-nums ${zeroVotes ? 'text-neutral-500' : ''}`}
                  >
                    {r.currentScore === null ? '—' : r.currentScore.toFixed(1)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

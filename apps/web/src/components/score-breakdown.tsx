'use client';

import { useTranslations } from 'next-intl';
import { CRITERIA, type Criterion } from '@voxscore/scoring';
import { ProvisionalBadge } from './provisional-badge';
import { trendDirection } from '@/lib/leaderboard';

export interface ScoreBreakdownProps {
  initialAiScore: number | null;
  currentScore: number | null;
  trendScore: number | null;
  isProvisional: boolean;
  breakdown: Partial<Record<Criterion, number>> | null;
  hasVideo: boolean;
}

function fmt(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

export function ScoreBreakdown(props: ScoreBreakdownProps) {
  const t = useTranslations();
  const trend = props.trendScore ?? 0;
  // Use the leaderboard's flat band (|trend| < 0.05 → flat) so a value that
  // rounds to 0.0 shows neutral with no '+' — matching the leaderboard arrow.
  const dir = trendDirection(props.trendScore);
  const trendColor =
    dir === 'up' ? 'text-emerald-400' : dir === 'down' ? 'text-rose-400' : 'text-neutral-400';

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-3xl font-bold">{fmt(props.currentScore)}</div>
          <div className="text-xs text-neutral-500">{t('Performance.currentScore')}</div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-medium ${trendColor}`}>
            {dir === 'up' ? '+' : ''}
            {trend.toFixed(1)} {t('Performance.trend')}
          </div>
          <div className="text-xs text-neutral-500">
            {t('Performance.aiStart')} {fmt(props.initialAiScore)}
          </div>
        </div>
      </header>

      {props.isProvisional && (
        <div className="mb-4">
          <ProvisionalBadge />
        </div>
      )}

      <ul className="space-y-1.5">
        {CRITERIA.filter((c) => props.hasVideo || c !== 'stagePresence').map((c) => {
          const value = props.breakdown?.[c] ?? null;
          return (
            <li key={c} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 text-neutral-400">{t(`Criteria.${c}`)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-800">
                <div className="h-full bg-emerald-500/70" style={{ width: `${value ?? 0}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right tabular-nums text-neutral-300">
                {fmt(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

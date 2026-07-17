'use client';

import { useTranslations } from 'next-intl';
import { measuredDisplayApplies } from '@voxscore/core';
import {
  AI_JUDGE_CRITERIA,
  CRITERIA,
  confidenceForVotes,
  confidenceMargin,
  type AiJudgeCriterion,
  type Criterion,
} from '@voxscore/scoring';
import { ProvisionalBadge } from './provisional-badge';
import { trendDirection } from '@/lib/leaderboard';

export interface ScoreBreakdownProps {
  initialAiScore: number | null;
  currentScore: number | null;
  trendScore: number | null;
  isProvisional: boolean;
  breakdown: Partial<Record<Criterion, number>> | null;
  /**
   * AI Judge (owned-recording DSP) per-metric breakdown — the 6 metrics the
   * pipeline actually measures. When set, it replaces the 9-criterion list:
   * showing unmeasured criteria under a verified score would imply
   * measurements that never happened.
   */
  aiJudgeBreakdown?: Partial<Record<AiJudgeCriterion, number>> | null;
  /** Real DSP values measured from the artist's own recording (ADR 0003). */
  measured?: Partial<Record<Criterion, number>> | null;
  hasVideo: boolean;
  verifiedVoteCount: number;
  /** Sample stddev of the per-vote overalls (scores.listener_stddev, RPC v5). */
  listenerStddev?: number | null;
  /** The measured take ran the same length (±5%) as the linked video (T13). */
  durationMatched?: boolean | null;
  /** Whether this performance links a YouTube video (gates the measured blend). */
  hasYoutubeLink: boolean;
}

const CONFIDENCE_KEY = {
  aiOnly: 'Performance.confidenceNone',
  earlyVotes: 'Performance.confidenceEarly',
  communityConfirmed: 'Performance.confidenceCommunity',
} as const;

function fmt(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

export function ScoreBreakdown(props: ScoreBreakdownProps) {
  const t = useTranslations();
  const margin = confidenceMargin(props.listenerStddev ?? null, props.verifiedVoteCount);
  // A measurement only earns the "Measured" badge on a criterion it actually
  // moved the score with — the SAME rule the measurements route blends by, so
  // the badge is never shown for a value that didn't count (fairness/honesty).
  const measuredApplies = measuredDisplayApplies(
    props.hasYoutubeLink,
    props.durationMatched ?? null,
  );
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
          <div className="text-3xl font-bold">
            {fmt(props.currentScore)}
            {margin !== null && (
              <span className="ml-1.5 align-middle text-sm font-medium text-neutral-500">
                {t('Performance.scoreInterval', { margin: margin.toFixed(1) })}
              </span>
            )}
          </div>
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {props.isProvisional && <ProvisionalBadge />}
        <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs font-medium text-neutral-300">
          {t(CONFIDENCE_KEY[confidenceForVotes(props.verifiedVoteCount)])}
        </span>
        {props.durationMatched && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-800 bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400">
            {t('Performance.durationMatched')}
          </span>
        )}
      </div>
      {props.verifiedVoteCount > 0 && (
        <p className="mb-4 text-xs text-neutral-500">
          {t('Performance.verifiedVotes', { count: props.verifiedVoteCount })}
        </p>
      )}

      {props.measured && measuredApplies && (
        <p className="mb-4 text-xs text-neutral-500">{t('Performance.measuredCaption')}</p>
      )}

      {props.aiJudgeBreakdown ? (
        <ul className="space-y-1.5">
          {AI_JUDGE_CRITERIA.map((c) => {
            const value = props.aiJudgeBreakdown?.[c] ?? null;
            return (
              <li key={c} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-neutral-400">
                  {t(`AiJudgeCriteria.${c}`)}
                  <span className="ml-1.5 rounded bg-sky-500/15 px-1 py-px text-[10px] font-medium text-sky-400">
                    {t('Performance.measuredBadge')}
                  </span>
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-800">
                  <div className="h-full bg-sky-500/70" style={{ width: `${value ?? 0}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-neutral-300">
                  {fmt(value)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {CRITERIA.filter((c) => props.hasVideo || c !== 'stagePresence').map((c) => {
            const measuredValue = measuredApplies ? (props.measured?.[c] ?? null) : null;
            const value = measuredValue ?? props.breakdown?.[c] ?? null;
            return (
              <li key={c} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-neutral-400">
                  {t(`Criteria.${c}`)}
                  {measuredValue !== null && (
                    <span className="ml-1.5 rounded bg-sky-500/15 px-1 py-px text-[10px] font-medium text-sky-400">
                      {t('Performance.measuredBadge')}
                    </span>
                  )}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-800">
                  <div
                    className={`h-full ${measuredValue !== null ? 'bg-sky-500/70' : 'bg-emerald-500/70'}`}
                    style={{ width: `${value ?? 0}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-neutral-300">
                  {fmt(value)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

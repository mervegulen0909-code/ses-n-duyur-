import { getTranslations } from 'next-intl/server';
import { ANALYTICS_EVENTS, type SongCategory } from '@voxscore/core';
import { isAdmin } from '@/lib/auth';
import { getAnalyticsSummary, type AnalyticsSummary } from '@/lib/analytics-summary';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CATEGORY_KEY: Record<SongCategory, string> = {
  pop: 'pop',
  rock: 'rock',
  'rnb-soul': 'rnbSoul',
  ballad: 'ballad',
  'turkish-global': 'turkishGlobal',
  'indie-alternative': 'indieAlternative',
  'musical-classical': 'musicalClassical',
  other: 'other',
};

/**
 * Growth dashboard over analytics_events (docs/analytics.md). Server-only:
 * the table has no user RLS policies, so reads go admin gate → service
 * client → aggregates. Event names render as their technical identifiers on
 * purpose — they are the shared vocabulary of the event catalog doc.
 */
export default async function AdminAnalyticsPage() {
  const t = await getTranslations();
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        {t('Admin.accessRequired')}
      </main>
    );
  }

  const service = createSupabaseServiceClient();
  if (!service) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const windows = [1, 7, 30] as const;
  const [day, week, month] = await Promise.all([
    getAnalyticsSummary(service, 1),
    getAnalyticsSummary(service, 7),
    getAnalyticsSummary(service, 30),
  ]);
  const byWindow: AnalyticsSummary[] = [day, week, month];

  const rate = (v: number | null) => (v === null ? '—' : v.toFixed(4));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t('Admin.analyticsHeading')}</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('Admin.funnelHeading')}</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/50 text-left text-neutral-400">
                <th className="px-4 py-2 font-medium">{t('Admin.eventColumn')}</th>
                {windows.map((d) => (
                  <th key={d} className="px-4 py-2 text-right font-medium">
                    {t('Admin.windowDays', { count: d })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ANALYTICS_EVENTS.map((event) => (
                <tr key={event} className="border-b border-neutral-800/60 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-neutral-300">{event}</td>
                  {byWindow.map((s) => (
                    <td key={s.days} className="px-4 py-2 text-right tabular-nums">
                      {s.funnel[event]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">
          {t('Admin.viralityHeading')} · {t('Admin.windowDays', { count: 30 })}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500">{t('Admin.inviteRate')}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {rate(month.virality.inviteConversionRate)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {t('Admin.inviteRateDetail', {
                invites: month.virality.invitesConverted,
                shares: month.virality.sharesClicked,
              })}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500">{t('Admin.viralCoefficient')}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {rate(month.virality.viralCoefficient)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {t('Admin.viralCoefficientDetail', {
                invites: month.virality.invitesConverted,
                signups: month.virality.signupsCompleted,
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t('Admin.categoriesHeading')} · {t('Admin.windowDays', { count: 30 })}
        </h2>
        {month.topCategories.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('Admin.noEvents')}</p>
        ) : (
          <ol className="space-y-2">
            {month.topCategories.map((c) => (
              <li
                key={c.category}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-sm"
              >
                <span>{t(`Category.${CATEGORY_KEY[c.category]}`)}</span>
                <span className="font-semibold tabular-nums">{c.count}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

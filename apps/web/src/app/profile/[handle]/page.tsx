import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { summarizeCreator } from '@/lib/creator';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw);
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, role')
    .eq('handle', handle)
    .maybeSingle();

  if (!profile) notFound();

  // Public view: active performances only (RLS would also surface the owner's
  // own non-active ones, but a profile page is the public creator view).
  const { data: perfs } = await supabase
    .from('performances')
    .select('id, oembed_meta, battle_wins, battle_count')
    .eq('user_id', profile.id)
    .eq('status', 'active');

  const ids = (perfs ?? []).map((p) => p.id);
  const { data: scores } = ids.length
    ? await supabase
        .from('scores')
        .select('performance_id, current_score, is_provisional')
        .in('performance_id', ids)
    : { data: [] };

  const summary = summarizeCreator(perfs ?? [], scores ?? []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">@{profile.handle}</h1>
          {profile.role === 'admin' && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
              {t('Nav.admin')}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          {t('Profile.performanceCount', { count: summary.totalPerformances })}
          {summary.battles > 0 && (
            <>
              {' · '}
              {t('Profile.battleRecord', { wins: summary.wins, losses: summary.losses })}
              {summary.winRate !== null && (
                <> · {t('Profile.winRate', { rate: (summary.winRate * 100).toFixed(0) })}</>
              )}
            </>
          )}
        </p>
      </header>

      {summary.rows.length === 0 ? (
        <p className="text-neutral-400">{t('Profile.noPublic')}</p>
      ) : (
        <ol className="space-y-2">
          {summary.rows.map((r, i) => (
            <li key={r.id}>
              <Link
                href={`/performance/${r.id}`}
                className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600"
              >
                <span className="w-6 text-right tabular-nums text-neutral-500">{i + 1}</span>
                <span className="flex-1 truncate text-sm">
                  {r.title || t('Common.untitledPerformance')}
                </span>
                {r.isProvisional && <ProvisionalBadge />}
                <span className="hidden text-xs text-neutral-500 sm:inline">
                  {r.wins}-{r.battles - r.wins}
                </span>
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

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RankBadge } from '@/components/rank-badge';
import { currentWeekStart } from '@/lib/league-points';
import {
  leagueRotationCountdown,
  normalizeLeagueTier,
  rankLeagueMembers,
  splitLeagueZones,
  type LeagueTier,
} from '@/lib/league-rotation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TIER = {
  0: { key: 'tierBronze', dot: 'bg-amber-600', text: 'text-amber-300' },
  1: { key: 'tierSilver', dot: 'bg-slate-300', text: 'text-slate-200' },
  2: { key: 'tierGold', dot: 'bg-yellow-400', text: 'text-yellow-300' },
  3: { key: 'tierDiamond', dot: 'bg-cyan-300', text: 'text-cyan-200' },
} as const satisfies Record<LeagueTier, { key: string; dot: string; text: string }>;

export default async function LeaguePage() {
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">{t('League.title')}</h1>
        <p className="mt-6 text-neutral-400">{t('Common.supabaseNotConfigured')}</p>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/league');

  const now = new Date();
  const weekStart = currentWeekStart(now);
  const countdown = leagueRotationCountdown(now, weekStart);
  const { data: membership, error: membershipError } = await supabase
    .from('league_memberships')
    .select('cohort_id, points')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (membershipError) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">{t('League.title')}</h1>
        <p className="mt-6 text-rose-300">{t('League.loadError')}</p>
      </main>
    );
  }

  if (!membership) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="border-b border-neutral-800 pb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
            VoxScore
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{t('League.title')}</h1>
        </div>
        <p className="max-w-xl py-10 text-base leading-7 text-neutral-300">
          {t('League.noCohort')}
        </p>
      </main>
    );
  }

  const [{ data: cohort, error: cohortError }, { data: memberRows, error: membersError }] =
    await Promise.all([
      supabase
        .from('league_cohorts')
        .select('id, tier')
        .eq('id', membership.cohort_id)
        .eq('week_start', weekStart)
        .maybeSingle(),
      supabase
        .from('league_memberships')
        .select('user_id, points')
        .eq('cohort_id', membership.cohort_id)
        .eq('week_start', weekStart),
    ]);

  if (cohortError || membersError || !cohort) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">{t('League.title')}</h1>
        <p className="mt-6 text-rose-300">{t('League.loadError')}</p>
      </main>
    );
  }

  const ranked = rankLeagueMembers(
    (memberRows ?? []).map((row) => ({ userId: row.user_id, points: row.points })),
  );
  const userIds = ranked.map((member) => member.userId);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, handle').in('id', userIds)
    : { data: [], error: null };

  if (profilesError || (profiles?.length ?? 0) !== ranked.length) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">{t('League.title')}</h1>
        <p className="mt-6 text-rose-300">{t('League.loadError')}</p>
      </main>
    );
  }

  const handles = new Map((profiles ?? []).map((profile) => [profile.id, profile.handle]));
  const tier = normalizeLeagueTier(cohort.tier);
  const tierMeta = TIER[tier];
  const zones = splitLeagueZones(ranked);
  const promotionIds =
    tier < 3 ? new Set(zones.promotion.map((member) => member.userId)) : new Set();
  const relegationIds =
    tier > 0 ? new Set(zones.relegation.map((member) => member.userId)) : new Set();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-neutral-800 pb-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              VoxScore
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{t('League.title')}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className={`inline-flex items-center gap-2 font-semibold ${tierMeta.text}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${tierMeta.dot}`} aria-hidden="true" />
                {t(`League.${tierMeta.key}`)}
              </span>
              <span className="text-neutral-600" aria-hidden="true">
                /
              </span>
              <span className="text-neutral-400">
                {t('League.members', { count: ranked.length })}
              </span>
            </div>
          </div>
          <time
            dateTime={countdown.dateTime}
            className="text-sm font-medium tabular-nums text-neutral-300"
          >
            {t('League.nextRotation', countdown)}
          </time>
        </div>
        <p className="mt-5 text-xs leading-5 text-neutral-500">{t('League.pointsGuide')}</p>
      </header>

      {(promotionIds.size > 0 || relegationIds.size > 0) && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-neutral-900 py-4 text-xs font-medium">
          {promotionIds.size > 0 && (
            <span className="inline-flex items-center gap-2 text-emerald-300">
              <span className="h-px w-5 bg-emerald-400" aria-hidden="true" />
              {t('League.promotionZone')}
            </span>
          )}
          {relegationIds.size > 0 && (
            <span className="inline-flex items-center gap-2 text-rose-300">
              <span className="h-px w-5 bg-rose-400" aria-hidden="true" />
              {t('League.relegationZone')}
            </span>
          )}
        </div>
      )}

      <ol className="mt-4 space-y-2">
        {ranked.map((member, index) => {
          const handle = handles.get(member.userId)!;
          const isMe = member.userId === user.id;
          const isPromotion = promotionIds.has(member.userId);
          const isRelegation = relegationIds.has(member.userId);
          const zoneClass = isPromotion
            ? 'border-emerald-900/80 bg-emerald-500/[0.04] hover:border-emerald-700'
            : isRelegation
              ? 'border-rose-950 bg-rose-500/[0.035] hover:border-rose-800'
              : 'border-neutral-800 bg-neutral-900/35 hover:border-neutral-600';

          return (
            <li key={member.userId}>
              <Link
                href={`/profile/${encodeURIComponent(handle)}`}
                aria-current={isMe ? 'true' : undefined}
                className={`flex min-w-0 items-center gap-4 rounded-xl border px-4 py-3 transition duration-150 motion-safe:hover:-translate-y-px ${zoneClass} ${
                  isMe ? 'ring-1 ring-emerald-300/70 ring-inset' : ''
                }`}
              >
                <RankBadge rank={index + 1} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  <bdi dir="auto">@{handle}</bdi>
                  {isPromotion && <span className="sr-only"> — {t('League.promotionZone')}</span>}
                  {isRelegation && <span className="sr-only"> — {t('League.relegationZone')}</span>}
                </span>
                {isMe && (
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300 uppercase">
                    {t('League.you')}
                  </span>
                )}
                <span className="shrink-0 text-end text-sm font-bold tabular-nums text-neutral-100">
                  {t('League.points', { count: member.points })}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

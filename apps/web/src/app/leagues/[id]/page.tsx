import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ResultShare } from '@/components/result-share';
import { getCurrentUser } from '@/lib/auth';
import { currentSeasonId } from '@/lib/seasons';
import { SITE_URL } from '@/lib/site';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface RankedMember {
  id: string;
  handle: string;
  wins: number;
  predictionPoints: number;
}

export default async function CustomLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/leagues/${id}`)}`);

  const t = await getTranslations();
  const service = createSupabaseServiceClient();
  if (!service) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const { data: membership } = await service
    .from('custom_league_members')
    .select('league_id')
    .eq('league_id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) notFound();

  const [{ data: league }, { data: memberRows, error: membersError }, seasonId] = await Promise.all(
    [
      service
        .from('custom_leagues')
        .select('id, name, join_code, owner_id')
        .eq('id', id)
        .maybeSingle(),
      service.from('custom_league_members').select('user_id').eq('league_id', id),
      currentSeasonId(service),
    ],
  );
  if (!league) notFound();

  const userIds = (memberRows ?? []).map((row) => row.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await service.from('profiles').select('id, handle, prediction_points').in('id', userIds)
    : { data: [], error: null };
  const { data: performances, error: performancesError } = userIds.length
    ? await service.from('performances').select('id, user_id').in('user_id', userIds)
    : { data: [], error: null };
  const performanceOwner = new Map((performances ?? []).map((row) => [row.id, row.user_id]));
  let battleQuery = service
    .from('battles')
    .select('winner_performance_id')
    .eq('status', 'closed')
    .not('winner_performance_id', 'is', null);
  if (seasonId) battleQuery = battleQuery.eq('season_id', seasonId);
  const { data: battleRows, error: battlesError } = performanceOwner.size
    ? await battleQuery.in('winner_performance_id', [...performanceOwner.keys()])
    : { data: [], error: null };

  const wins = new Map<string, number>();
  for (const battle of battleRows ?? []) {
    if (!battle.winner_performance_id) continue;
    const owner = performanceOwner.get(battle.winner_performance_id);
    if (owner) wins.set(owner, (wins.get(owner) ?? 0) + 1);
  }
  const ranked: RankedMember[] = (profiles ?? [])
    .map((profile) => ({
      id: profile.id,
      handle: profile.handle,
      wins: wins.get(profile.id) ?? 0,
      predictionPoints: profile.prediction_points,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.predictionPoints - a.predictionPoints ||
        a.handle.localeCompare(b.handle),
    );
  const loadError = membersError || profilesError || performancesError || battlesError;
  const inviteUrl = `${SITE_URL}/leagues/join?code=${encodeURIComponent(league.join_code)}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-neutral-800 pb-7">
        <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
          {t('Leagues.seasonBoard')}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{league.name}</h1>
        <p className="mt-3 text-sm text-neutral-500">
          {t('Leagues.memberCount', { count: ranked.length })}
        </p>
      </header>

      {loadError ? (
        <p role="alert" className="mt-7 text-rose-300">
          {t('Leagues.loadError')}
        </p>
      ) : (
        <div className="mt-7 overflow-hidden rounded-2xl border border-neutral-800">
          <div className="grid grid-cols-[3rem_1fr_auto_auto] gap-3 border-b border-neutral-800 bg-neutral-900/70 px-4 py-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            <span>#</span>
            <span>{t('Leagues.member')}</span>
            <span className="text-end">{t('Leagues.wins')}</span>
            <span className="text-end">{t('Leagues.points')}</span>
          </div>
          <ol>
            {ranked.map((member, index) => (
              <li
                key={member.id}
                className={`grid grid-cols-[3rem_1fr_auto_auto] items-center gap-3 border-b border-neutral-900 px-4 py-3 last:border-0 ${
                  member.id === user.id ? 'bg-emerald-400/[0.06]' : ''
                }`}
              >
                <span className="font-bold tabular-nums text-neutral-500">{index + 1}</span>
                <span className="min-w-0 truncate font-medium">
                  <bdi dir="auto">@{member.handle}</bdi>
                </span>
                <span className="min-w-10 text-end font-bold tabular-nums text-emerald-300">
                  {member.wins}
                </span>
                <span className="min-w-14 text-end font-bold tabular-nums text-violet-300">
                  {member.predictionPoints}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <section className="mt-8 rounded-2xl border border-cyan-900/70 bg-cyan-400/[0.04] p-5 text-center">
        <h2 className="font-bold">{t('Leagues.inviteMembers')}</h2>
        <p className="mt-3 font-mono text-xl font-black tracking-[0.24em] text-cyan-300">
          {league.join_code}
        </p>
        <div className="mt-5">
          <ResultShare
            headline={t('Leagues.inviteHeadline', { name: league.name })}
            score={null}
            url={inviteUrl}
            context="custom_league_invite"
          />
        </div>
      </section>
    </main>
  );
}

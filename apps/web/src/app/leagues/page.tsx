import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LeagueForms } from '@/components/league-forms';
import { getCurrentUser } from '@/lib/auth';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LeaguesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/leagues');

  const t = await getTranslations();
  const service = createSupabaseServiceClient();
  if (!service) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-black tracking-tight">{t('Leagues.title')}</h1>
        <p className="mt-6 text-neutral-400">{t('Common.supabaseNotConfigured')}</p>
      </main>
    );
  }

  const { data: memberships, error: membershipError } = await service
    .from('custom_league_members')
    .select('league_id, joined_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });
  const ids = (memberships ?? []).map((row) => row.league_id);
  const { data: leagues, error: leagueError } = ids.length
    ? await service.from('custom_leagues').select('id, name, owner_id, created_at').in('id', ids)
    : { data: [], error: null };

  const leagueById = new Map((leagues ?? []).map((league) => [league.id, league]));
  const ordered = ids.flatMap((id) => {
    const league = leagueById.get(id);
    return league ? [league] : [];
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="border-b border-neutral-800 pb-7">
        <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
          VoxScore crews
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{t('Leagues.title')}</h1>
        <p className="mt-3 max-w-2xl text-neutral-400">{t('Leagues.subtitle')}</p>
      </header>

      {membershipError || leagueError ? (
        <p role="alert" className="my-8 text-rose-300">
          {t('Leagues.loadError')}
        </p>
      ) : ordered.length > 0 ? (
        <ul className="my-8 grid gap-3 sm:grid-cols-2">
          {ordered.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.id}`}
                className="group block rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition hover:-translate-y-0.5 hover:border-emerald-700"
              >
                <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  {league.owner_id === user.id ? t('Leagues.owner') : t('Leagues.member')}
                </span>
                <span className="mt-2 block text-lg font-bold group-hover:text-emerald-300">
                  {league.name}
                </span>
                <span className="mt-4 block text-sm text-neutral-500">
                  {t('Leagues.viewLeague')} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-8 rounded-2xl border border-dashed border-neutral-800 p-6 text-neutral-400">
          {t('Leagues.empty')}
        </p>
      )}

      <LeagueForms />
    </main>
  );
}

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { leagueJoinSchema } from '@voxscore/core';
import { LeagueJoinAction } from '@/components/league-join-action';
import { getCurrentUser } from '@/lib/auth';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LeagueInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const parsed = leagueJoinSchema.safeParse({ code: params.code ?? '' });
  const code = parsed.success ? parsed.data.code : null;
  const user = await getCurrentUser();
  if (!user && code) {
    const next = `/leagues/join?code=${encodeURIComponent(code)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const t = await getTranslations();
  let name: string | null = null;
  if (user && code) {
    const service = createSupabaseServiceClient();
    const { data } = service
      ? await service.from('custom_leagues').select('name').eq('join_code', code).maybeSingle()
      : { data: null };
    name = data?.name ?? null;
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-14 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
        VoxScore invite
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-tight">
        {name ? t('Leagues.inviteTitle', { name }) : t('Leagues.joinCta')}
      </h1>
      {!code ? (
        <p role="alert" className="mt-5 text-rose-300">
          {t('Leagues.invalidCode')}
        </p>
      ) : !name ? (
        <p role="alert" className="mt-5 text-rose-300">
          {t('Leagues.notFound')}
        </p>
      ) : (
        <>
          <p className="mt-5 text-neutral-400">{t('Leagues.inviteBody')}</p>
          <p className="mt-4 font-mono text-xl font-bold tracking-[0.24em] text-cyan-300">{code}</p>
          <LeagueJoinAction code={code} />
        </>
      )}
    </main>
  );
}

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ResultShare } from '@/components/result-share';
import { getCurrentUser } from '@/lib/auth';
import { currentSeasonId } from '@/lib/seasons';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildWrappedData } from '@/lib/wrapped';

export const dynamic = 'force-dynamic';

/**
 * Season Wrapped: a private, story-styled recap of the signed-in user's
 * season (Spotify-Wrapped pattern) ending in the copy-paste share artifact.
 * The aggregates are the user's OWN numbers, read via the service client
 * (buildWrappedData) after auth — signed-out visitors are bounced to login.
 */
export default async function WrappedPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/wrapped');

  const t = await getTranslations();

  const service = createSupabaseServiceClient();
  if (!service) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-bold">{t('Wrapped.title')}</h1>
        <p className="text-neutral-400">{t('Common.supabaseNotConfigured')}</p>
      </main>
    );
  }

  const data = await buildWrappedData(service, user.id, await currentSeasonId(service));

  const stats = [
    { key: 'wins', value: data.battlesWon, accent: 'text-emerald-400' },
    { key: 'losses', value: data.battlesLost, accent: 'text-rose-400' },
    { key: 'votes', value: data.votesCast, accent: 'text-sky-400' },
    { key: 'listens', value: data.validListens, accent: 'text-amber-400' },
    { key: 'predictionPoints', value: data.predictionPoints, accent: 'text-violet-400' },
  ] as const;

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <section className="rounded-3xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-8">
        <h1 className="text-center text-2xl font-bold tracking-tight">{t('Wrapped.title')}</h1>
        <dl className="mt-8 grid grid-cols-2 gap-4">
          {stats.map((s, i) => (
            <div
              key={s.key}
              className={`rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 text-center ${
                i === stats.length - 1 ? 'col-span-2' : ''
              }`}
            >
              <dd className={`text-4xl font-black tabular-nums ${s.accent}`}>{s.value}</dd>
              <dt className="mt-1 text-xs tracking-wide text-neutral-400 uppercase">
                {t(`Wrapped.${s.key}`)}
              </dt>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <ResultShare
            headline={t('Wrapped.shareHeadline', { wins: data.battlesWon })}
            score={null}
            url="https://voxscore.app/wrapped"
            context="season_wrapped"
          />
        </div>
      </section>
    </main>
  );
}

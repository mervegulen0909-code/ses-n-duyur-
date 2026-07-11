import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { CategoryChips } from '@/components/category-chips';
import { InviteFriendCard } from '@/components/invite-friend-card';
import { toScoreView, type ScoreRow } from '@/lib/score';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface OEmbedish {
  title?: string;
  thumbnailUrl?: string;
  authorName?: string;
}

interface PerformanceCard {
  id: string;
  youtube_video_id: string | null;
  oembed_meta: unknown;
}

interface FeaturedChallenge {
  title: string;
  songId: string;
  songTitle: string;
}

export default async function HomePage() {
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  let performances: PerformanceCard[] = [];
  let scoreByPerf = new Map<string, ScoreRow>();
  let featured: FeaturedChallenge | null = null;

  if (supabase) {
    const { data } = await supabase
      .from('performances')
      .select('id, youtube_video_id, oembed_meta')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(24);
    performances = data ?? [];

    const ids = performances.map((p) => p.id);
    if (ids.length) {
      const { data: scores } = await supabase
        .from('scores')
        .select('performance_id, current_score, is_provisional')
        .in('performance_id', ids);
      scoreByPerf = new Map((scores ?? []).map((s) => [s.performance_id, s]));
    }

    const { data: challenge } = await supabase
      .from('featured_challenges')
      .select('title, song_id, songs(title)')
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (challenge) {
      const song = challenge.songs as unknown as { title: string } | null;
      featured = { title: challenge.title, songId: challenge.song_id, songTitle: song?.title ?? '' };
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <section className="mb-10 text-center">
        <h1 className="text-balance text-4xl font-bold sm:text-5xl">
          {t.rich('Home.heroTitle', {
            hl: (chunks) => <span className="text-emerald-400">{chunks}</span>,
          })}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-neutral-400">
          {t('Home.heroSubtitle')}
        </p>
      </section>

      {!supabase ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          {t.rich('Home.supabaseHint', { code: (chunks) => <code>{chunks}</code> })}
        </p>
      ) : (
        <>
          {featured && (
            <section className="mb-8 rounded-xl border border-emerald-800/50 bg-emerald-500/5 p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                {t('Home.featuredHeading')}
              </div>
              <Link
                href={`/song/${featured.songId}?challenge=1`}
                className="mt-1 block text-lg font-semibold hover:underline"
              >
                {featured.title || featured.songTitle}
              </Link>
            </section>
          )}

          <section className="mb-8">
            <CategoryChips />
          </section>

          <section className="mb-10 grid gap-4 sm:grid-cols-3">
            <Link
              href="/leaderboard"
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 hover:border-neutral-600"
            >
              <div className="font-semibold">{t('Home.ctaChallengeTitle')}</div>
              <div className="mt-1 text-sm text-neutral-500">{t('Home.ctaChallengeBody')}</div>
            </Link>
            <Link
              href="/add"
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 hover:border-neutral-600"
            >
              <div className="font-semibold">{t('Home.ctaRequestTitle')}</div>
              <div className="mt-1 text-sm text-neutral-500">{t('Home.ctaRequestBody')}</div>
            </Link>
            <InviteFriendCard />
          </section>
        </>
      )}

      {!supabase ? null : performances.length === 0 ? null : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {performances.map((p) => {
            const meta = (p.oembed_meta ?? {}) as OEmbedish;
            const score = toScoreView(scoreByPerf.get(p.id));
            return (
              <li key={p.id}>
                <Link
                  href={`/performance/${p.id}`}
                  className="block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 transition hover:border-neutral-600"
                >
                  {meta.thumbnailUrl ? (
                    <img
                      src={meta.thumbnailUrl}
                      alt=""
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-video w-full bg-neutral-800" />
                  )}
                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-medium">
                      {meta.title ?? t('Common.untitledPerformance')}
                    </div>
                    {meta.authorName && (
                      <div className="mt-1 text-xs text-neutral-500">{meta.authorName}</div>
                    )}
                    {score.currentScore !== null && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {score.currentScore.toFixed(1)}
                        </span>
                        {score.isProvisional && <ProvisionalBadge />}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

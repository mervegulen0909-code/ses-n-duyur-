import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RANKED_SCORE_STATUSES } from '@voxscore/core';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { CategoryChips } from '@/components/category-chips';
import { GuestBattle } from '@/components/guest-battle';
import { InviteFriendCard } from '@/components/invite-friend-card';
import { TrackLandingView } from '@/components/track-landing-view';
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

interface GuestSide {
  videoId: string;
  title: string;
}

export default async function HomePage() {
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  let performances: PerformanceCard[] = [];
  let scoreByPerf = new Map<string, ScoreRow>();
  let featured: FeaturedChallenge | null = null;
  let viewerId: string | null = null;
  let guestPair: { a: GuestSide; b: GuestSide } | null = null;
  let totalPerformances = 0;
  let openBattles = 0;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    viewerId = user?.id ?? null;

    const [{ count: performanceCount }, { count: battleCount }] = await Promise.all([
      supabase
        .from('performances')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase.from('battles').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);
    totalPerformances = performanceCount ?? 0;
    openBattles = battleCount ?? 0;

    // Signup-free teaser (onboarding <60s): signed-out visitors get the
    // most-battled song's top pairing to watch immediately — no writes,
    // the real vote flow stays behind login + Verified Listen.
    if (!user) {
      const { data: recentBattles } = await supabase
        .from('battles')
        .select('song_id')
        .not('song_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      const counts = new Map<string, number>();
      for (const b of recentBattles ?? [])
        if (b.song_id) counts.set(b.song_id, (counts.get(b.song_id) ?? 0) + 1);
      const songId = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      if (songId) {
        const { data: perfs } = await supabase
          .from('performances')
          .select('youtube_video_id, oembed_meta')
          .eq('song_id', songId)
          .eq('status', 'active')
          .not('youtube_video_id', 'is', null)
          .limit(2);
        if (perfs && perfs.length === 2) {
          const titleOf = (m: unknown) => ((m ?? {}) as { title?: string }).title ?? 'Performance';
          guestPair = {
            a: { videoId: perfs[0]!.youtube_video_id!, title: titleOf(perfs[0]!.oembed_meta) },
            b: { videoId: perfs[1]!.youtube_video_id!, title: titleOf(perfs[1]!.oembed_meta) },
          };
        }
      }
    }
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
        .in('performance_id', ids)
        .in('score_status', [...RANKED_SCORE_STATUSES]);
      scoreByPerf = new Map((scores ?? []).map((s) => [s.performance_id, s]));
    }

    // Only a challenge whose window is OPEN right now — an expired row with
    // the newest starts_at must not linger on the homepage forever.
    const nowIso = new Date().toISOString();
    const { data: challenge } = await supabase
      .from('featured_challenges')
      .select('title, song_id, songs(title)')
      .lte('starts_at', nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (challenge) {
      const song = challenge.songs as unknown as { title: string } | null;
      featured = {
        title: challenge.title,
        songId: challenge.song_id,
        songTitle: song?.title ?? '',
      };
    }
  }

  return (
    <main className="mx-auto max-w-6xl overflow-hidden px-6 py-8 sm:py-12">
      <TrackLandingView />
      <section className="relative mb-12 grid border-y border-neutral-800 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
        <div className="relative py-10 pe-0 lg:py-16 lg:pe-12">
          <div
            aria-hidden="true"
            className="absolute -top-20 -left-32 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"
          />
          <p className="relative flex items-center gap-3 text-xs font-black tracking-[0.22em] text-emerald-300 uppercase">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {t('Home.heroEyebrow')}
          </p>
          <h1 className="relative mt-6 max-w-4xl text-balance text-5xl leading-[0.94] font-black tracking-[-0.055em] sm:text-7xl">
            {t.rich('Home.heroTitle', {
              hl: (chunks) => <span className="text-emerald-400">{chunks}</span>,
            })}
          </h1>
          <p className="relative mt-7 max-w-2xl text-pretty text-base leading-7 text-neutral-400 sm:text-lg">
            {t('Home.heroSubtitle')}
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            <Link
              href="/battle"
              className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              {t('Home.battleNow')} →
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-xl border border-neutral-700 px-5 py-3 text-sm font-bold transition hover:border-neutral-400"
            >
              {t('Home.exploreRanks')}
            </Link>
          </div>
        </div>

        <aside className="border-t border-neutral-800 py-8 lg:border-t-0 lg:border-s lg:py-10 lg:ps-8">
          <p className="text-xs font-black tracking-[0.2em] text-neutral-500 uppercase">
            {t('Home.liveBoard')}
          </p>
          <dl className="mt-5 divide-y divide-neutral-800 border-y border-neutral-800">
            <div className="flex items-end justify-between gap-4 py-5">
              <dt className="text-sm text-neutral-400">{t('Home.rankedVoices')}</dt>
              <dd className="text-4xl font-black tabular-nums text-neutral-100">
                {totalPerformances}
              </dd>
            </div>
            <div className="flex items-end justify-between gap-4 py-5">
              <dt className="text-sm text-neutral-400">{t('Home.openBattles')}</dt>
              <dd className="text-4xl font-black tabular-nums text-cyan-300">{openBattles}</dd>
            </div>
            <div className="py-5">
              <dt className="text-xs font-bold tracking-wide text-amber-300 uppercase">
                {t('Home.verifiedRule')}
              </dt>
            </div>
          </dl>
        </aside>
      </section>

      {!supabase ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          {t.rich('Home.supabaseHint', { code: (chunks) => <code>{chunks}</code> })}
        </p>
      ) : (
        <>
          {featured && (
            <section className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-emerald-900/70 bg-emerald-500/[0.04] px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                {t('Home.featuredHeading')}
              </div>
              <Link
                href={`/song/${featured.songId}?challenge=1`}
                className="mt-1 block text-lg font-black hover:text-emerald-300"
              >
                {featured.title || featured.songTitle}
              </Link>
            </section>
          )}

          {guestPair && (
            <section className="mb-10 w-full">
              <div className="mb-4 flex items-center gap-4">
                <h2 className="text-lg font-black">{t('Home.tryNow')}</h2>
                <span className="h-px flex-1 bg-neutral-800" />
              </div>
              <GuestBattle a={guestPair.a} b={guestPair.b} loginNext="/battle" entry="home" />
            </section>
          )}

          <section className="mb-8">
            <CategoryChips />
          </section>

          <section className="mb-12 grid border-y border-neutral-800 sm:grid-cols-3 sm:divide-x sm:divide-neutral-800">
            <Link
              href="/leaderboard"
              className="group px-5 py-6 transition hover:bg-neutral-900/60"
            >
              <div className="font-bold group-hover:text-emerald-300">
                {t('Home.ctaChallengeTitle')} →
              </div>
              <div className="mt-1 text-sm text-neutral-500">{t('Home.ctaChallengeBody')}</div>
            </Link>
            <Link
              href="/add"
              className="group border-t border-neutral-800 px-5 py-6 transition hover:bg-neutral-900/60 sm:border-t-0"
            >
              <div className="font-bold group-hover:text-emerald-300">
                {t('Home.ctaRequestTitle')} →
              </div>
              <div className="mt-1 text-sm text-neutral-500">{t('Home.ctaRequestBody')}</div>
            </Link>
            <InviteFriendCard refCode={viewerId} />
          </section>
        </>
      )}

      {!supabase ? null : performances.length === 0 ? null : (
        <section>
          <div className="mb-5 flex items-end justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-neutral-500 uppercase">
                {t('Home.liveBoard')}
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">{t('Home.latestHeading')}</h2>
            </div>
            <Link
              href="/leaderboard"
              className="text-sm font-bold text-emerald-400 hover:underline"
            >
              {t('Home.exploreRanks')} →
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-px overflow-hidden border border-neutral-800 bg-neutral-800 sm:grid-cols-2 lg:grid-cols-3">
            {performances.map((p) => {
              const meta = (p.oembed_meta ?? {}) as OEmbedish;
              const score = toScoreView(scoreByPerf.get(p.id));
              return (
                <li key={p.id}>
                  <Link
                    href={`/performance/${p.id}`}
                    className="group block h-full overflow-hidden bg-neutral-950 transition hover:bg-neutral-900"
                  >
                    {meta.thumbnailUrl ? (
                      <img
                        src={meta.thumbnailUrl}
                        alt=""
                        className="aspect-video w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100 motion-reduce:transition-none"
                      />
                    ) : (
                      <div className="aspect-video w-full bg-neutral-800" />
                    )}
                    <div className="p-4">
                      <div className="line-clamp-2 text-sm font-bold">
                        {meta.title ?? t('Common.untitledPerformance')}
                      </div>
                      {meta.authorName && (
                        <div className="mt-1 text-xs text-neutral-500">{meta.authorName}</div>
                      )}
                      {score.currentScore !== null && (
                        <div className="mt-4 flex items-end justify-between gap-2 border-t border-neutral-800 pt-3">
                          <span className="text-3xl font-black tabular-nums text-emerald-300">
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
        </section>
      )}
    </main>
  );
}

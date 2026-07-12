import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Criterion } from '@voxscore/scoring';
import { YouTubeEmbed } from '@/components/youtube-embed';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { VotePanel } from '@/components/vote-panel';
import { ReportButton } from '@/components/report-button';
import { AppealForm } from '@/components/appeal-form';
import { CommentComposer } from '@/components/comment-composer';
import { ShareButtons } from '@/components/share-buttons';
import { withAuthors } from '@/lib/comments';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface OEmbedish {
  title?: string;
  authorName?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return {};

  const { data: perf } = await supabase
    .from('performances')
    .select('oembed_meta')
    .eq('id', id)
    .maybeSingle();
  const { data: score } = await supabase
    .from('scores')
    .select('current_score')
    .eq('performance_id', id)
    .maybeSingle();

  const meta = (perf?.oembed_meta ?? {}) as OEmbedish;
  const songTitle = meta.title ?? 'Performance';
  const scoreLabel =
    score?.current_score !== null && score?.current_score !== undefined
      ? score.current_score.toFixed(1)
      : '—';
  const title = `${songTitle} — ${scoreLabel} on VoxScore`;

  return { title, openGraph: { title }, twitter: { title } };
}

export default async function PerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const { data: perf } = await supabase
    .from('performances')
    .select('id, user_id, youtube_video_id, oembed_meta, has_video, song_id, status')
    .eq('id', id)
    .maybeSingle();

  // RLS already restricts a hidden performance to its owner + admins
  // (performances_select_all: status = 'active' or user_id = auth.uid() or
  // is_admin()) — a stranger's request simply gets no row here.
  if (!perf) notFound();

  const { data: uploader } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', perf.user_id)
    .maybeSingle();

  // Same-song ranking link — the core "who sings THIS song best" loop.
  const { data: song } = perf.song_id
    ? await supabase.from('songs').select('id, title').eq('id', perf.song_id).maybeSingle()
    : { data: null };

  const { data: score } = await supabase
    .from('scores')
    .select(
      'initial_ai_score, current_score, trend_score, is_provisional, ai_breakdown, verified_vote_count, listener_stddev',
    )
    .eq('performance_id', id)
    .maybeSingle();

  // Real DSP measurement of the artist's own recording, when one exists
  // (ADR 0003) — surfaces per-criterion "Measured" badges in the breakdown.
  const { data: measuredRow } = await supabase
    .from('measured_scores')
    .select('measured_breakdown, duration_matched')
    .eq('performance_id', id)
    .maybeSingle();

  const meta = (perf.oembed_meta ?? {}) as OEmbedish;
  const breakdown = (score?.ai_breakdown ?? null) as Partial<Record<Criterion, number>> | null;
  const measured = (measuredRow?.measured_breakdown ?? null) as Partial<
    Record<Criterion, number>
  > | null;
  const user = await getCurrentUser();

  const { data: rawComments } = await supabase
    .from('comments')
    .select('id, body, created_at, user_id')
    .eq('performance_id', id)
    .order('created_at', { ascending: false });
  const commenterIds = [...new Set((rawComments ?? []).map((c) => c.user_id))];
  const { data: commenterProfiles } = commenterIds.length
    ? await supabase.from('profiles').select('id, handle').in('id', commenterIds)
    : { data: [] };
  const comments = withAuthors(rawComments ?? [], commenterProfiles ?? []);

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold">{meta.title ?? t('Performance.fallbackTitle')}</h1>
          {user && <ReportButton targetType="performance" targetId={perf.id} />}
        </div>
        {perf.status === 'hidden' && user?.id === perf.user_id && (
          <div className="space-y-2 rounded-lg border border-amber-700/40 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-300">{t('Appeals.hiddenBanner')}</p>
            <AppealForm targetType="performance" targetId={perf.id} />
          </div>
        )}
        {meta.authorName && <p className="text-sm text-neutral-500">{meta.authorName}</p>}
        {song && (
          <p className="text-sm">
            <Link href={`/song/${song.id}`} className="text-emerald-400 hover:underline">
              {t('Song.viewRanking', { title: song.title })} →
            </Link>
          </p>
        )}
        {uploader?.handle && (
          <p className="text-sm text-neutral-500">
            {t.rich('Performance.addedBy', {
              handle: `@${uploader.handle}`,
              link: (chunks) => (
                <Link
                  href={`/profile/${encodeURIComponent(uploader.handle!)}`}
                  className="text-emerald-400 hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
        {!perf.youtube_video_id ? (
          <p className="text-neutral-500">{t('Performance.noVideo')}</p>
        ) : user ? (
          <VotePanel
            performanceId={perf.id}
            videoId={perf.youtube_video_id}
            hasVideo={perf.has_video}
          />
        ) : (
          <>
            <YouTubeEmbed videoId={perf.youtube_video_id} title={meta.title} />
            <p className="text-xs text-neutral-600">
              {t.rich('Performance.signInToVote', {
                link: (chunks) => (
                  <Link href="/login" className="text-emerald-400">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </>
        )}
      </div>

      <aside>
        <ScoreBreakdown
          initialAiScore={score?.initial_ai_score ?? null}
          currentScore={score?.current_score ?? null}
          trendScore={score?.trend_score ?? null}
          isProvisional={score?.is_provisional ?? true}
          breakdown={breakdown}
          measured={measured}
          hasVideo={perf.has_video}
          verifiedVoteCount={score?.verified_vote_count ?? 0}
          listenerStddev={score?.listener_stddev ?? null}
          durationMatched={measuredRow?.duration_matched ?? null}
          hasYoutubeLink={!!perf.youtube_video_id}
        />
        {perf.youtube_video_id && (
          <div className="mt-4">
            <ShareButtons
              url={`/performance/${perf.id}`}
              title={meta.title ?? t('Performance.fallbackTitle')}
              storyImagePath={`/performance/${perf.id}/story-image`}
            />
            {song && (
              <Link
                href={`/song/${song.id}?challenge=1`}
                className="mt-3 block text-center text-sm font-medium text-emerald-400 hover:underline"
              >
                {t('Performance.challengeCta')} →
              </Link>
            )}
          </div>
        )}
      </aside>

      <section className="lg:col-span-2">
        <h2 className="mb-4 text-lg font-semibold">{t('Comments.heading')}</h2>
        {user ? (
          <div className="mb-6">
            <CommentComposer performanceId={perf.id} />
          </div>
        ) : (
          <p className="mb-6 text-sm text-neutral-500">
            {t.rich('Performance.signInToComment', {
              link: (chunks) => (
                <Link href="/login" className="text-emerald-400">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}

        {comments.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('Comments.empty')}</p>
        ) : (
          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {c.authorHandle ? (
                      <Link
                        href={`/profile/${encodeURIComponent(c.authorHandle)}`}
                        className="font-medium text-emerald-400 hover:underline"
                      >
                        @{c.authorHandle}
                      </Link>
                    ) : (
                      <span className="text-neutral-500">{t('Comments.unknownAuthor')}</span>
                    )}
                    <span className="text-neutral-600"> · {c.createdAt.slice(0, 10)}</span>
                  </span>
                  {user && <ReportButton targetType="comment" targetId={c.id} />}
                </div>
                <p className="whitespace-pre-wrap text-sm text-neutral-300">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Criterion } from '@vocal-league/scoring';
import { YouTubeEmbed } from '@/components/youtube-embed';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { VotePanel } from '@/components/vote-panel';
import { ReportButton } from '@/components/report-button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface OEmbedish {
  title?: string;
  authorName?: string;
}

export default async function PerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-400">
        Supabase is not configured yet.
      </main>
    );
  }

  const { data: perf } = await supabase
    .from('performances')
    .select('id, user_id, youtube_video_id, oembed_meta, has_video')
    .eq('id', id)
    .maybeSingle();

  if (!perf) notFound();

  const { data: uploader } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', perf.user_id)
    .maybeSingle();

  const { data: score } = await supabase
    .from('scores')
    .select('initial_ai_score, current_score, trend_score, is_provisional, ai_breakdown')
    .eq('performance_id', id)
    .maybeSingle();

  const meta = (perf.oembed_meta ?? {}) as OEmbedish;
  const breakdown = (score?.ai_breakdown ?? null) as Partial<Record<Criterion, number>> | null;
  const user = await getCurrentUser();

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold">{meta.title ?? 'Performance'}</h1>
          {user && <ReportButton targetType="performance" targetId={perf.id} />}
        </div>
        {meta.authorName && <p className="text-sm text-neutral-500">{meta.authorName}</p>}
        {uploader?.handle && (
          <p className="text-sm text-neutral-500">
            Added by{' '}
            <Link
              href={`/profile/${encodeURIComponent(uploader.handle)}`}
              className="text-emerald-400 hover:underline"
            >
              @{uploader.handle}
            </Link>
          </p>
        )}
        {!perf.youtube_video_id ? (
          <p className="text-neutral-500">No video.</p>
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
              <Link href="/login" className="text-emerald-400">
                Sign in
              </Link>{' '}
              and complete a Verified Listen to vote.
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
          hasVideo={perf.has_video}
        />
      </aside>
    </main>
  );
}

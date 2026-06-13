import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ProvisionalBadge } from '@/components/provisional-badge';
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

export default async function HomePage() {
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  let performances: PerformanceCard[] = [];
  let scoreByPerf = new Map<string, ScoreRow>();

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
      ) : performances.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
          <p className="text-neutral-400">{t('Common.noPerformances')}</p>
          <Link href="/add" className="mt-3 inline-block font-medium text-emerald-400">
            {t('Home.addFirst')}
          </Link>
        </div>
      ) : (
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

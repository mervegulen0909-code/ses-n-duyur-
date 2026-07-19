import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { ShareKitActions } from '@/components/share-kit-actions';
import { SITE_URL } from '@/lib/site';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface OEmbedish {
  title?: string;
  authorName?: string;
}

export default async function ShareKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10 text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const [{ data: performance }, { data: score }] = await Promise.all([
    supabase.from('performances').select('id, oembed_meta, status').eq('id', id).maybeSingle(),
    supabase
      .from('scores')
      .select('current_score, is_provisional')
      .eq('performance_id', id)
      .eq('score_status', 'ai_verified')
      .maybeSingle(),
  ]);
  if (!performance || performance.status === 'removed') notFound();

  const meta = (performance.oembed_meta ?? {}) as OEmbedish;
  const title = meta.title ?? t('Performance.fallbackTitle');
  const publicUrl = `${SITE_URL}/performance/${performance.id}`;
  const imageHref = `/performance/${performance.id}/story-image`;
  const caption = t('ShareKit.caption', { url: publicUrl });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="max-w-2xl">
        <Link
          href={`/performance/${performance.id}`}
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          ← {t('ShareKit.back')}
        </Link>
        <p className="mt-7 text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
          VoxScore creator tools
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">{t('ShareKit.title')}</h1>
        <p className="mt-3 text-neutral-400">{title}</p>
        {score?.current_score !== null && score?.current_score !== undefined && (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-2xl font-black tabular-nums text-emerald-300">
              {score.current_score.toFixed(1)}
            </p>
            {score.is_provisional && <ProvisionalBadge />}
          </div>
        )}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border border-neutral-800 bg-neutral-900 p-2 shadow-2xl shadow-emerald-950/20">
          <img
            src={imageHref}
            alt={t('ShareKit.cardAlt', { title })}
            className="aspect-[9/16] w-full rounded-[1.6rem] object-cover"
          />
        </div>

        <div>
          <h2 className="text-lg font-bold">{t('ShareKit.captionHeading')}</h2>
          <div className="mt-4">
            <ShareKitActions caption={caption} imageHref={imageHref} />
          </div>
          <h2 className="mt-10 text-lg font-bold">{t('ShareKit.howTo')}</h2>
          <ol className="mt-4 space-y-4">
            {[t('ShareKit.kitStep1'), t('ShareKit.kitStep2'), t('ShareKit.kitStep3')].map(
              (step, index) => (
                <li key={step} className="flex gap-4 rounded-2xl border border-neutral-800 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400 font-black text-emerald-950">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-neutral-300">{step}</span>
                </li>
              ),
            )}
          </ol>
          <p className="mt-6 text-xs leading-5 text-neutral-500">{t('ShareKit.mediaNotice')}</p>
        </div>
      </div>
    </main>
  );
}

import Link from 'next/link';
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
  const supabase = await createSupabaseServerClient();
  let performances: PerformanceCard[] = [];

  if (supabase) {
    const { data } = await supabase
      .from('performances')
      .select('id, youtube_video_id, oembed_meta')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(24);
    performances = data ?? [];
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <section className="mb-10 text-center">
        <h1 className="text-balance text-4xl font-bold sm:text-5xl">
          Discover who sings a song <span className="text-emerald-400">best</span>.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-neutral-400">
          Add a YouTube performance, get a Provisional AI Estimate, then let verified listeners vote
          and battle.
        </p>
      </section>

      {!supabase ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          Supabase is not configured yet. Start the local stack (<code>pnpm db:start</code>) and set{' '}
          <code>.env.local</code>, then add a performance.
        </p>
      ) : performances.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
          <p className="text-neutral-400">No performances yet.</p>
          <Link href="/add" className="mt-3 inline-block font-medium text-emerald-400">
            Add the first one →
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {performances.map((p) => {
            const meta = (p.oembed_meta ?? {}) as OEmbedish;
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
                      {meta.title ?? 'Untitled performance'}
                    </div>
                    {meta.authorName && (
                      <div className="mt-1 text-xs text-neutral-500">{meta.authorName}</div>
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

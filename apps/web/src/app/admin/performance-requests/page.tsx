import { getTranslations } from 'next-intl/server';
import type { SongCategory } from '@voxscore/core';
import { isAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PerformanceRequestActions } from '@/components/admin-actions';

export const dynamic = 'force-dynamic';

const CATEGORY_KEY: Record<SongCategory, string> = {
  pop: 'pop',
  rock: 'rock',
  'rnb-soul': 'rnbSoul',
  ballad: 'ballad',
  'turkish-global': 'turkishGlobal',
  'indie-alternative': 'indieAlternative',
  'musical-classical': 'musicalClassical',
  other: 'other',
};

export default async function PerformanceRequestsPage() {
  const t = await getTranslations();
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        {t('Admin.accessRequired')}
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: requests } = await supabase!
    .from('performance_requests')
    .select('id, user_id, youtube_url, category, note, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const requesterIds = [...new Set((requests ?? []).map((r) => r.user_id))];
  const { data: requesters } = requesterIds.length
    ? await supabase!.from('profiles').select('id, handle').in('id', requesterIds)
    : { data: [] };
  const handleById = new Map((requesters ?? []).map((p) => [p.id, p.handle]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t('Admin.performanceRequestsQueue')}</h1>
      {!requests || requests.length === 0 ? (
        <p className="text-neutral-400">{t('Admin.noOpenPerformanceRequests')}</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <a
                  href={r.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-emerald-400 hover:underline"
                >
                  {r.youtube_url}
                </a>
                <span className="shrink-0 text-xs text-neutral-500">
                  {t(`Category.${CATEGORY_KEY[r.category]}`)}
                </span>
              </div>
              <div className="text-xs text-neutral-500">
                @{handleById.get(r.user_id) ?? r.user_id} · {r.created_at.slice(0, 10)}
              </div>
              {r.note && <p className="text-sm text-neutral-300">{r.note}</p>}
              <PerformanceRequestActions requestId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

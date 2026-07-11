import { getTranslations } from 'next-intl/server';
import { isAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppealActions } from '@/components/admin-actions';

export const dynamic = 'force-dynamic';

export default async function AppealsQueuePage() {
  const t = await getTranslations('Admin');
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        {t('accessRequired')}
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: appeals } = await supabase!
    .from('appeals')
    .select('id, user_id, target_type, target_id, reason, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const appellantIds = [...new Set((appeals ?? []).map((a) => a.user_id))];
  const { data: appellants } = appellantIds.length
    ? await supabase!.from('profiles').select('id, handle').in('id', appellantIds)
    : { data: [] };
  const handleById = new Map((appellants ?? []).map((p) => [p.id, p.handle]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t('appealsQueue')}</h1>
      {!appeals || appeals.length === 0 ? (
        <p className="text-neutral-400">{t('noOpenAppeals')}</p>
      ) : (
        <ul className="space-y-3">
          {appeals.map((a) => (
            <li
              key={a.id}
              className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {a.target_type} · {a.target_id}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  @{handleById.get(a.user_id) ?? a.user_id}
                </span>
              </div>
              <p className="text-sm text-neutral-300">{a.reason}</p>
              <div className="text-xs text-neutral-600">{a.created_at.slice(0, 10)}</div>
              <AppealActions appealId={a.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

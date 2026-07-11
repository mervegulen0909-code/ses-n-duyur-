import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AddPerformanceForm } from '@/components/add-performance-form';
import { MyRequestsList, type MyRequestRow } from '@/components/my-requests-list';
import { getCurrentUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AddPage() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  let requests: MyRequestRow[] = [];
  if (user) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase!
      .from('performance_requests')
      .select('id, status, category, youtube_url, rejection_reason, approved_performance_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    requests = data ?? [];
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t('Add.title')}</h1>
        <p className="mt-2 text-sm text-neutral-400">{t('Add.subtitle')}</p>
      </div>

      {user ? (
        <>
          <AddPerformanceForm />
          <MyRequestsList requests={requests} />
        </>
      ) : (
        <p className="text-sm text-neutral-400">
          {t.rich('Add.signInPrompt', {
            link: (chunks) => (
              <Link href="/login" className="font-medium text-emerald-400">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </main>
  );
}

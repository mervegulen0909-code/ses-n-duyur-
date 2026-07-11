import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { isAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const t = await getTranslations();
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        {t('Admin.accessRequired')}
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { count: flags } = await supabase!
    .from('moderation_flags')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');
  const { count: dmca } = await supabase!
    .from('dmca_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');
  const { count: performanceRequests } = await supabase!
    .from('performance_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  const { count: appeals } = await supabase!
    .from('appeals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const cards = [
    {
      href: '/admin/moderation',
      title: t('Admin.cardModeration'),
      sub: t('Admin.openFlags', { count: flags ?? 0 }),
    },
    {
      href: '/admin/dmca',
      title: t('Admin.cardDmca'),
      sub: t('Admin.openRequests', { count: dmca ?? 0 }),
    },
    {
      href: '/admin/performance-requests',
      title: t('Admin.cardPerformanceRequests'),
      sub: t('Admin.openPerformanceRequests', { count: performanceRequests ?? 0 }),
    },
    {
      href: '/admin/appeals',
      title: t('Admin.cardAppeals'),
      sub: t('Admin.openAppeals', { count: appeals ?? 0 }),
    },
    {
      href: '/admin/calibrate',
      title: t('Admin.cardCalibration'),
      sub: t('Admin.calibrationSub'),
    },
    {
      href: '/admin/analytics',
      title: t('Admin.cardAnalytics'),
      sub: t('Admin.analyticsSub'),
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t('Nav.admin')}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 hover:border-neutral-600"
          >
            <div className="font-semibold">{c.title}</div>
            <div className="mt-1 text-sm text-neutral-500">{c.sub}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

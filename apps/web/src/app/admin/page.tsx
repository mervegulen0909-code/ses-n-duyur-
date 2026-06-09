import Link from 'next/link';
import { isAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        Admin access required.
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

  const cards = [
    { href: '/admin/moderation', title: 'Moderation', sub: `${flags ?? 0} open flags` },
    { href: '/admin/dmca', title: 'DMCA / Takedowns', sub: `${dmca ?? 0} open requests` },
    { href: '/admin/calibrate', title: 'Calibration scoring', sub: 'Anchor the AI model' },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-3">
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

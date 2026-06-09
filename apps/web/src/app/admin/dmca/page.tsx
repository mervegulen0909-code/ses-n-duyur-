import { isAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DmcaActions } from '@/components/admin-actions';

export const dynamic = 'force-dynamic';

export default async function AdminDmcaPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        Admin access required.
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: reqs } = await supabase!
    .from('dmca_requests')
    .select('id, performance_id, claimant, details, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">DMCA / Takedown requests</h1>
      {!reqs || reqs.length === 0 ? (
        <p className="text-neutral-400">No open requests.</p>
      ) : (
        <ul className="space-y-3">
          {reqs.map((r) => (
            <li
              key={r.id}
              className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="text-sm font-medium">{r.claimant}</div>
              {r.performance_id && (
                <div className="text-xs text-neutral-500">Performance: {r.performance_id}</div>
              )}
              {r.details && <p className="text-sm text-neutral-300">{r.details}</p>}
              <DmcaActions requestId={r.id} performanceId={r.performance_id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

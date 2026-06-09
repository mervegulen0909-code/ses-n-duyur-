import { isAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ModerationActions } from '@/components/admin-actions';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        Admin access required.
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: flags } = await supabase!
    .from('moderation_flags')
    .select('id, target_type, target_id, reason, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">Moderation queue</h1>
      {!flags || flags.length === 0 ? (
        <p className="text-neutral-400">No open flags.</p>
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => (
            <li
              key={f.id}
              className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                {f.target_type} · {f.target_id}
              </div>
              <p className="text-sm">{f.reason}</p>
              <ModerationActions
                flagId={f.id}
                performanceId={f.target_type === 'performance' ? f.target_id : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

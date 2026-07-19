import Link from 'next/link';
import { AccountDeleteConfirm } from '@/components/account-delete-confirm';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Delete Account — VoxScore' };

/**
 * Web-accessible account deletion (Google Play Data Safety requires a
 * deletion path reachable without installing the app; Apple 5.1.1(v) requires
 * in-app deletion, which already exists on mobile). Calls the same
 * `/api/account/delete` route as the mobile Profile screen — one server-side
 * implementation, two entry points.
 */
export default async function AccountDeletePage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-neutral-400">
        Supabase is not configured in this environment.
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Delete Account</h1>
      <p>
        Deleting your VoxScore account permanently removes your profile, performances you added,
        votes, verified listens, and comments. See the{' '}
        <a className="text-emerald-400" href="/privacy">
          Privacy Policy
        </a>{' '}
        for exactly what is erased versus retained (some moderation and takedown records survive,
        anonymized).
      </p>

      {user ? (
        <AccountDeleteConfirm email={user.email ?? null} />
      ) : (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          You need to be signed in to delete your account.{' '}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Sign in
          </Link>{' '}
          first, then come back to this page.
        </p>
      )}
    </main>
  );
}

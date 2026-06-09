'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    await createSupabaseBrowserClient().auth.signOut();
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
    >
      Sign out
    </button>
  );
}

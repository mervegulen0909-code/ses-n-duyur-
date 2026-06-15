'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@voxscore/db';

/** Browser client for client components. Requires NEXT_PUBLIC_* env at runtime. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
}

import 'server-only';
import { computeStreak } from '@voxscore/core';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** Current verified-listen streak, computed from the last 60 days of rows.
 *  Only VALID listens count (server-validated — Hard Rule 4); the 60-day
 *  window is a read bound, far past the 30-day gold tier. */
export async function currentListenStreak(
  service: ServiceClient,
  userId: string,
  today: string,
): Promise<number> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86400000).toISOString();
  const { data } = await service
    .from('verified_listens')
    .select('created_at')
    .eq('user_id', userId)
    .eq('is_valid', true)
    .gte('created_at', since);
  return computeStreak(
    (data ?? []).map((r) => r.created_at.slice(0, 10)),
    today,
  );
}

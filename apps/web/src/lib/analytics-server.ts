import 'server-only';
import type { AnalyticsEvent } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/**
 * Server-triggered analytics insert (votes, listens, battles, request
 * approval — actions with no client-side `track()` call to piggyback on).
 * Best-effort and silent: a dropped analytics event must never fail the
 * request that triggered it. Authenticated events join on `userId`; a fresh
 * random `session_id` satisfies the NOT NULL column since there is no
 * client-persisted session at this layer.
 */
export async function trackServer(
  service: ServiceClient,
  event: AnalyticsEvent,
  userId?: string | null,
  meta?: Record<string, string | number>,
): Promise<void> {
  try {
    await service.from('analytics_events').insert({
      event,
      session_id: crypto.randomUUID(),
      user_id: userId ?? null,
      meta: (meta ?? null) as unknown as Json | null,
    });
  } catch {
    // Analytics must never fail the request that triggered it.
  }
}

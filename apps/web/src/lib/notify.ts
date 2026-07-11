import 'server-only';
import type { NotificationKind } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/**
 * Queue a push notification for a user — inserted at the same server call
 * sites as the §4.8 analytics events (trackServer). A scheduled sender
 * (/api/cron/send-notifications) drains `sent_at is null` rows via the Expo
 * Push API. Best-effort and silent, same posture as trackServer/grantBadge:
 * a dropped notification must never fail the request that triggered it.
 */
export async function notifyServer(
  service: ServiceClient,
  userId: string,
  kind: NotificationKind,
  meta?: Record<string, string | number>,
): Promise<void> {
  try {
    await service.from('notification_events').insert({
      user_id: userId,
      kind,
      meta: (meta ?? null) as unknown as Json | null,
    });
  } catch {
    // Notifications must never fail the request that triggered them.
  }
}

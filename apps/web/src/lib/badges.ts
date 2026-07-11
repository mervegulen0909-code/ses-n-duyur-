import 'server-only';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** The full badge catalog (supabase/migrations/20260711170000_badges.sql +
 *  20260711200000_inviter_badge.sql). */
export type BadgeKey = 'first_performance' | 'centurion' | 'battle_champion' | 'inviter';

/**
 * Award a badge via the SECURITY DEFINER grant_badge() RPC — the ONLY writer
 * of profile_badges (no user/admin path ever sets one directly). Idempotent
 * (ON CONFLICT DO NOTHING), so callers grant speculatively at every unlock
 * check without tracking "was this the first time" themselves. Best-effort
 * and silent, same posture as trackServer: a dropped badge grant must never
 * fail the request that triggered it.
 */
export async function grantBadge(
  service: ServiceClient,
  userId: string,
  badgeKey: BadgeKey,
): Promise<void> {
  try {
    await service.rpc('grant_badge', { p_user_id: userId, p_badge_key: badgeKey });
  } catch {
    // Badge grants must never fail the request that triggered them.
  }
}

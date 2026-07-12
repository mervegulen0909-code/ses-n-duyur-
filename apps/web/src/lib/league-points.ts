import 'server-only';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

export interface LeaguePointSource {
  kind: 'verified_listen' | 'battle_vote' | 'battle_win';
  id: string;
}

/** Monday (UTC) of the current week as 'YYYY-MM-DD'. Weeks run Mon-Sun; the
 *  rotation cron and every point accrual key off this same anchor. */
export function currentWeekStart(now: Date): string {
  const day = now.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Add league points to this week's membership via the SECURITY DEFINER
 * add_league_points() RPC (the only writer of league_memberships.points).
 * Silent no-op if the user has no cohort this week (they joined mid-week —
 * the next Monday rotation picks them up). Best-effort and silent, same
 * posture as grantBadge/trackServer: a dropped point must never fail the
 * request that triggered it.
 */
export async function addLeaguePoints(
  service: ServiceClient,
  userId: string,
  delta: number,
  source?: LeaguePointSource,
): Promise<void> {
  try {
    const base = {
      p_user_id: userId,
      p_week_start: currentWeekStart(new Date()),
      p_delta: delta,
    };
    if (source) {
      await service.rpc('award_league_points', {
        ...base,
        p_source_kind: source.kind,
        p_source_id: source.id,
      });
    } else {
      await service.rpc('add_league_points', base);
    }
  } catch {
    // League points must never fail the request that triggered them.
  }
}

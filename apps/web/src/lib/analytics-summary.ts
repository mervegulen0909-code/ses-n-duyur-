import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@voxscore/db';
import { ANALYTICS_EVENTS, SONG_CATEGORIES } from '@voxscore/core';

/**
 * Aggregated growth metrics over a trailing window, computed with the SERVICE
 * client — `analytics_events` has no user RLS policies at all (by design, see
 * docs/analytics.md), so these queries only work server-side behind the admin
 * gate. Returns aggregates ONLY: never raw event rows, never per-user data —
 * this feeds a growth dashboard, not a user-activity log.
 */
export interface AnalyticsSummary {
  days: number;
  /** Count per funnel event (docs/analytics.md event catalog order). */
  funnel: Record<(typeof ANALYTICS_EVENTS)[number], number>;
  virality: {
    sharesClicked: number;
    invitesConverted: number;
    signupsCompleted: number;
    /** invite_converted / share_clicked, null when there are no shares. */
    inviteConversionRate: number | null;
    /** invite_converted / signup_completed, null when there are no signups. */
    viralCoefficient: number | null;
  };
  /** Performance-request demand by category, most-requested first (nonzero only). */
  topCategories: { category: (typeof SONG_CATEGORIES)[number]; count: number }[];
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export async function getAnalyticsSummary(
  service: SupabaseClient<Database>,
  days: number,
): Promise<AnalyticsSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // One indexed head-count per event/category — bounded (11 + 8 queries),
  // and each hits analytics_events_event_time_idx / the category column
  // directly, so no raw rows ever leave the database.
  const [eventCounts, categoryCounts] = await Promise.all([
    Promise.all(
      ANALYTICS_EVENTS.map(async (event) => {
        const { count } = await service
          .from('analytics_events')
          .select('*', { count: 'exact', head: true })
          .eq('event', event)
          .gte('created_at', since);
        return [event, count ?? 0] as const;
      }),
    ),
    Promise.all(
      SONG_CATEGORIES.map(async (category) => {
        const { count } = await service
          .from('performance_requests')
          .select('*', { count: 'exact', head: true })
          .eq('category', category)
          .gte('created_at', since);
        return { category, count: count ?? 0 };
      }),
    ),
  ]);

  const funnel = Object.fromEntries(eventCounts) as AnalyticsSummary['funnel'];
  const shares = funnel.share_clicked;
  const invites = funnel.invite_converted;
  const signups = funnel.signup_completed;

  return {
    days,
    funnel,
    virality: {
      sharesClicked: shares,
      invitesConverted: invites,
      signupsCompleted: signups,
      inviteConversionRate: shares > 0 ? round4(invites / shares) : null,
      viralCoefficient: signups > 0 ? round4(invites / signups) : null,
    },
    topCategories: categoryCounts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
  };
}

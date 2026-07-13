import 'server-only';
import { createHash } from 'node:crypto';

export const LEAGUE_COHORT_SIZE = 30;
export const LEAGUE_ZONE_SIZE = 10;

export type LeagueTier = 0 | 1 | 2 | 3;

export interface RankedLeagueMember {
  userId: string;
  points: number;
}

export interface ActiveLeagueProfile {
  id: string;
  leagueTier: number;
}

export interface CohortPlan {
  tier: LeagueTier;
  userIds: string[];
}

export function normalizeLeagueTier(tier: number): LeagueTier {
  return Math.max(0, Math.min(3, Math.trunc(tier))) as LeagueTier;
}

function shiftWeek(weekStart: string, days: number): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function previousWeekStart(weekStart: string): string {
  return shiftWeek(weekStart, -7);
}

export function nextWeekStart(weekStart: string): string {
  return shiftWeek(weekStart, 7);
}

/** Rounded-up hours until the next UTC Monday for stable server rendering. */
export function leagueRotationCountdown(
  now: Date,
  weekStart: string,
): { days: number; hours: number; dateTime: string } {
  const dateTime = `${nextWeekStart(weekStart)}T00:00:00.000Z`;
  const remainingHours = Math.max(
    0,
    Math.ceil((Date.parse(dateTime) - now.getTime()) / (60 * 60 * 1_000)),
  );
  return {
    days: Math.floor(remainingHours / 24),
    hours: remainingHours % 24,
    dateTime,
  };
}

/** Points descending; stable, shared user-id tie-break for cron and UI. */
export function rankLeagueMembers<T extends RankedLeagueMember>(members: readonly T[]): T[] {
  return [...members].sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
}

/**
 * Split a ranked cohort into disjoint movement zones. Top-ten takes priority
 * in a short cohort, so a person can never be both promoted and relegated.
 */
export function splitLeagueZones<T>(ranked: readonly T[]): {
  promotion: T[];
  middle: T[];
  relegation: T[];
} {
  const promotionCount = Math.min(LEAGUE_ZONE_SIZE, ranked.length);
  const relegationCount = Math.min(LEAGUE_ZONE_SIZE, Math.max(0, ranked.length - promotionCount));
  const relegationStart = ranked.length - relegationCount;
  return {
    promotion: ranked.slice(0, promotionCount),
    middle: ranked.slice(promotionCount, relegationStart),
    relegation: ranked.slice(relegationStart),
  };
}

/** Tier-separated, md5-stable groups of at most 30 members. */
export function deterministicCohortPlans(
  profiles: readonly ActiveLeagueProfile[],
  weekStart: string,
  size = LEAGUE_COHORT_SIZE,
): CohortPlan[] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Cohort size must be positive');

  const unique = new Map(profiles.map((profile) => [profile.id, profile]));
  const byTier = new Map<LeagueTier, ActiveLeagueProfile[]>();
  for (const profile of unique.values()) {
    const tier = normalizeLeagueTier(profile.leagueTier);
    const members = byTier.get(tier) ?? [];
    members.push(profile);
    byTier.set(tier, members);
  }

  const plans: CohortPlan[] = [];
  for (const tier of [0, 1, 2, 3] as const) {
    const ordered = (byTier.get(tier) ?? [])
      .map((profile) => ({
        profile,
        key: createHash('md5').update(`${profile.id}${weekStart}`).digest('hex'),
      }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.profile.id.localeCompare(b.profile.id))
      .map(({ profile }) => profile.id);

    for (let offset = 0; offset < ordered.length; offset += size) {
      plans.push({ tier, userIds: ordered.slice(offset, offset + size) });
    }
  }
  return plans;
}

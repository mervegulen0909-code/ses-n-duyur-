import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { currentWeekStart } from '@/lib/league-points';
import { notifyServer } from '@/lib/notify';
import {
  deterministicCohortPlans,
  normalizeLeagueTier,
  previousWeekStart,
  rankLeagueMembers,
  splitLeagueZones,
} from '@/lib/league-rotation';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

const PAGE_SIZE = 1_000;
const PROFILE_BATCH_SIZE = 200;
const NOTIFICATION_LIMIT = 5_000;
const NOTIFICATION_CONCURRENCY = 50;

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

async function loadActiveUserIds(
  service: ServiceClient,
  since: string,
): Promise<{ ids: string[]; failed: boolean }> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from('analytics_events')
      .select('id, user_id')
      .not('user_id', 'is', null)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { ids: [], failed: true };
    for (const row of data ?? []) {
      if (row.user_id) ids.add(row.user_id);
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return { ids: [...ids], failed: false };
}

async function loadCurrentMemberIds(
  service: ServiceClient,
  weekStart: string,
): Promise<{ ids: Set<string>; failed: boolean }> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from('league_memberships')
      .select('user_id')
      .eq('week_start', weekStart)
      .order('user_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { ids: new Set(), failed: true };
    for (const row of data ?? []) ids.add(row.user_id);
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return { ids, failed: false };
}

async function applyPreviousWeekMovement(
  service: ServiceClient,
  weekStart: string,
): Promise<{ promoted: number; relegated: number; failed: boolean }> {
  const { data: cohorts, error: cohortError } = await service
    .from('league_cohorts')
    .select('id, tier')
    .eq('week_start', weekStart)
    .order('id', { ascending: true });
  if (cohortError) return { promoted: 0, relegated: 0, failed: true };

  let promoted = 0;
  let relegated = 0;
  for (const cohort of cohorts ?? []) {
    const { data: rows, error: memberError } = await service
      .from('league_memberships')
      .select('user_id, points')
      .eq('cohort_id', cohort.id);
    if (memberError) return { promoted, relegated, failed: true };

    const ranked = rankLeagueMembers(
      (rows ?? []).map((row) => ({ userId: row.user_id, points: row.points })),
    );
    const zones = splitLeagueZones(ranked);
    const tier = normalizeLeagueTier(cohort.tier);
    const promotionTier = normalizeLeagueTier(tier + 1);
    const relegationTier = normalizeLeagueTier(tier - 1);

    if (promotionTier !== tier && zones.promotion.length > 0) {
      const { error } = await service
        .from('profiles')
        .update({ league_tier: promotionTier })
        .in(
          'id',
          zones.promotion.map((member) => member.userId),
        );
      if (error) return { promoted, relegated, failed: true };
      promoted += zones.promotion.length;
    }
    if (relegationTier !== tier && zones.relegation.length > 0) {
      const { error } = await service
        .from('profiles')
        .update({ league_tier: relegationTier })
        .in(
          'id',
          zones.relegation.map((member) => member.userId),
        );
      if (error) return { promoted, relegated, failed: true };
      relegated += zones.relegation.length;
    }
  }
  return { promoted, relegated, failed: false };
}

async function loadProfiles(service: ServiceClient, userIds: readonly string[]) {
  const profiles: { id: string; leagueTier: number }[] = [];
  for (const batch of batches(userIds, PROFILE_BATCH_SIZE)) {
    const { data, error } = await service
      .from('profiles')
      .select('id, league_tier')
      .in('id', batch);
    if (error) return { profiles: [], failed: true };
    profiles.push(
      ...(data ?? []).map((profile) => ({ id: profile.id, leagueTier: profile.league_tier })),
    );
  }
  return { profiles, failed: false };
}

/**
 * Weekly cohort rotation. Vercel invokes it daily at midnight UTC; the route
 * self-gates to Monday, closes last week's movement zones, then places every
 * active unassigned user into a deterministic <=30-person tier cohort.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  if (now.getUTCDay() !== 1) {
    return Response.json({ skipped: 'not monday' });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const weekStart = currentWeekStart(now);
  const lastWeek = previousWeekStart(weekStart);
  const { data: movementMarker, error: markerReadError } = await service
    .from('league_rotation_weeks')
    .select('week_start')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (markerReadError) {
    return Response.json({ error: 'Could not load league rotation state' }, { status: 500 });
  }

  let movement = { promoted: 0, relegated: 0, failed: false };
  if (!movementMarker) {
    movement = await applyPreviousWeekMovement(service, lastWeek);
    if (movement.failed) {
      return Response.json({ error: 'Could not rotate prior league tiers' }, { status: 500 });
    }
    const { error: markerWriteError } = await service.from('league_rotation_weeks').upsert(
      {
        week_start: weekStart,
        movement_completed_at: now.toISOString(),
      },
      { onConflict: 'week_start' },
    );
    if (markerWriteError) {
      return Response.json({ error: 'Could not save league rotation state' }, { status: 500 });
    }
  }

  const existing = await loadCurrentMemberIds(service, weekStart);
  if (existing.failed) {
    return Response.json({ error: 'Could not load current league members' }, { status: 500 });
  }

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const active = await loadActiveUserIds(service, since);
  if (active.failed) {
    return Response.json({ error: 'Could not load active league users' }, { status: 500 });
  }
  const unplaced = active.ids.filter((userId) => !existing.ids.has(userId));
  const profileResult = await loadProfiles(service, unplaced);
  if (profileResult.failed) {
    return Response.json({ error: 'Could not load league profiles' }, { status: 500 });
  }

  const plans = deterministicCohortPlans(profileResult.profiles, weekStart);
  const newlyPlaced: string[] = [];
  let cohortsCreated = 0;
  for (const plan of plans) {
    const { data: cohort, error: cohortError } = await service
      .from('league_cohorts')
      .insert({ week_start: weekStart, tier: plan.tier })
      .select('id')
      .single();
    if (cohortError || !cohort) {
      return Response.json({ error: 'Could not create league cohort' }, { status: 500 });
    }

    const { data: inserted, error: memberError } = await service
      .from('league_memberships')
      .upsert(
        plan.userIds.map((userId) => ({
          cohort_id: cohort.id,
          user_id: userId,
          week_start: weekStart,
          points: 0,
        })),
        { onConflict: 'user_id,week_start', ignoreDuplicates: true },
      )
      .select('user_id');
    if (memberError) {
      await service.from('league_cohorts').delete().eq('id', cohort.id);
      return Response.json({ error: 'Could not place league members' }, { status: 500 });
    }

    const insertedIds = (inserted ?? []).map((row) => row.user_id);
    if (insertedIds.length === 0) {
      await service.from('league_cohorts').delete().eq('id', cohort.id);
      continue;
    }
    cohortsCreated += 1;
    newlyPlaced.push(...insertedIds);
  }

  const notificationIds = newlyPlaced.slice(0, NOTIFICATION_LIMIT);
  for (const batch of batches(notificationIds, NOTIFICATION_CONCURRENCY)) {
    await Promise.all(
      batch.map((userId) => notifyServer(service, userId, 'league_week_started', { weekStart })),
    );
  }

  return Response.json({
    rotated: true,
    weekStart,
    promoted: movement.promoted,
    relegated: movement.relegated,
    cohortsCreated,
    membersPlaced: newlyPlaced.length,
    notificationsAttempted: notificationIds.length,
  });
}

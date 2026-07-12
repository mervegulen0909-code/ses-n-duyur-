import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({
  notifyServer: vi.fn(async () => undefined),
}));

import { notifyServer } from '@/lib/notify';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET } from './route';

type Service = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

const THIS_MONDAY = '2026-07-13';
const LAST_MONDAY = '2026-07-06';

function request(secret?: string): Request {
  return new Request('http://localhost/api/cron/rotate-leagues', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function makeService(
  opts: {
    activeCount?: number;
    priorCount?: number;
    currentIds?: string[];
    priorTier?: number;
    analyticsError?: boolean;
  } = {},
) {
  const activeUsers = Array.from({ length: opts.activeCount ?? 31 }, (_, index) => ({
    id: `event-${String(index + 1).padStart(5, '0')}`,
    user_id: `active-${String(index + 1).padStart(5, '0')}`,
  }));
  const priorMembers = Array.from({ length: opts.priorCount ?? 30 }, (_, index) => ({
    user_id: `prior-${String(index + 1).padStart(2, '0')}`,
    points: 100 - index,
  }));
  const currentIds = new Set(opts.currentIds ?? []);
  const profileUpdates: { tier: number; ids: string[] }[] = [];
  const cohortInserts: { week_start: string; tier: number }[] = [];
  const membershipUpserts: { cohort_id: string; user_id: string; week_start: string }[][] = [];
  let nextCohort = 0;
  let movementMarked = false;

  const from = vi.fn((table: string) => {
    if (table === 'league_rotation_weeks') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: movementMarked ? { week_start: THIS_MONDAY } : null,
              error: null,
            })),
          })),
        })),
        upsert: vi.fn(async () => {
          movementMarked = true;
          return { error: null };
        }),
      };
    }

    if (table === 'league_cohorts') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_column: string, week: string) => {
            expect(week).toBe(LAST_MONDAY);
            return {
              order: vi.fn(async () => ({
                data: [{ id: 'prior-cohort', tier: opts.priorTier ?? 1 }],
                error: null,
              })),
            };
          }),
        })),
        insert: vi.fn((payload: { week_start: string; tier: number }) => {
          cohortInserts.push(payload);
          const id = `new-cohort-${++nextCohort}`;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id }, error: null })),
            })),
          };
        }),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      };
    }

    if (table === 'league_memberships') {
      return {
        select: vi.fn((columns: string) => ({
          eq: vi.fn((column: string, value: string) => {
            if (columns === 'user_id') {
              expect([column, value]).toEqual(['week_start', THIS_MONDAY]);
              return {
                order: vi.fn(() => ({
                  range: vi.fn(async (fromIndex: number, toIndex: number) => ({
                    data: [...currentIds]
                      .sort()
                      .slice(fromIndex, toIndex + 1)
                      .map((user_id) => ({ user_id })),
                    error: null,
                  })),
                })),
              };
            }
            expect([columns, column, value]).toEqual([
              'user_id, points',
              'cohort_id',
              'prior-cohort',
            ]);
            return Promise.resolve({ data: priorMembers, error: null });
          }),
        })),
        upsert: vi.fn((rows: (typeof membershipUpserts)[number]) => {
          membershipUpserts.push(rows);
          for (const row of rows) currentIds.add(row.user_id);
          return {
            select: vi.fn(async () => ({
              data: rows.map((row) => ({ user_id: row.user_id })),
              error: null,
            })),
          };
        }),
      };
    }

    if (table === 'profiles') {
      return {
        update: vi.fn((payload: { league_tier: number }) => ({
          in: vi.fn(async (_column: string, ids: string[]) => {
            profileUpdates.push({ tier: payload.league_tier, ids });
            return { error: null };
          }),
        })),
        select: vi.fn(() => ({
          in: vi.fn(async (_column: string, ids: string[]) => ({
            data: ids.map((id) => ({ id, league_tier: 1 })),
            error: null,
          })),
        })),
      };
    }

    if (table === 'analytics_events') {
      return {
        select: vi.fn(() => ({
          not: vi.fn(() => ({
            gt: vi.fn(() => ({
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn(async (fromIndex: number, toIndex: number) => ({
                    data: activeUsers.slice(fromIndex, toIndex + 1),
                    error: opts.analyticsError ? { message: 'analytics down' } : null,
                  })),
                })),
              })),
            })),
          })),
        })),
      };
    }

    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as Service,
    profileUpdates,
    cohortInserts,
    membershipUpserts,
  };
}

describe('GET /api/cron/rotate-leagues', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${THIS_MONDAY}T00:00:00.000Z`));
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('rejects callers without the cron bearer secret', async () => {
    expect((await GET(request())).status).toBe(403);
    expect((await GET(request('wrong'))).status).toBe(403);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('skips authenticated non-Monday calls before creating the service client', async () => {
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    const response = await GET(request('test-secret'));
    await expect(response.json()).resolves.toEqual({ skipped: 'not monday' });
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('returns 503 on Monday when the service role is unavailable', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    expect((await GET(request('test-secret'))).status).toBe(503);
  });

  it('moves prior zones and creates deterministic cohorts of at most 30', async () => {
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const response = await GET(request('test-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rotated: true,
      weekStart: THIS_MONDAY,
      promoted: 10,
      relegated: 10,
      cohortsCreated: 2,
      membersPlaced: 31,
      notificationsAttempted: 31,
    });
    expect(service.profileUpdates).toEqual([
      {
        tier: 2,
        ids: Array.from({ length: 10 }, (_, i) => `prior-${String(i + 1).padStart(2, '0')}`),
      },
      {
        tier: 0,
        ids: Array.from({ length: 10 }, (_, i) => `prior-${String(i + 21).padStart(2, '0')}`),
      },
    ]);
    expect(service.membershipUpserts.map((rows) => rows.length).sort((a, b) => a - b)).toEqual([
      1, 30,
    ]);
    expect(service.membershipUpserts.flat()).toHaveLength(31);
    expect(notifyServer).toHaveBeenCalledTimes(31);
  });

  it('never moves a short-cohort member in both directions', async () => {
    const service = makeService({ activeCount: 0, priorCount: 15 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const response = await GET(request('test-secret'));

    await expect(response.json()).resolves.toMatchObject({ promoted: 10, relegated: 5 });
    const moved = service.profileUpdates.flatMap((update) => update.ids);
    expect(new Set(moved).size).toBe(moved.length);
  });

  it('skips users already placed this week and does not notify them again', async () => {
    const service = makeService({ activeCount: 2, currentIds: ['active-00001'] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const response = await GET(request('test-secret'));

    await expect(response.json()).resolves.toMatchObject({ membersPlaced: 1 });
    expect(service.membershipUpserts.flat().map((row) => row.user_id)).toEqual(['active-00002']);
    expect(notifyServer).toHaveBeenCalledTimes(1);
    expect(notifyServer).toHaveBeenCalledWith(
      service.client,
      'active-00002',
      'league_week_started',
      { weekStart: THIS_MONDAY },
    );
  });

  it('is retry-idempotent on Monday: no duplicate cohorts, movement, or notifications', async () => {
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    await GET(request('test-secret'));
    const retry = await GET(request('test-secret'));

    await expect(retry.json()).resolves.toMatchObject({
      rotated: true,
      promoted: 0,
      relegated: 0,
      cohortsCreated: 0,
      membersPlaced: 0,
      notificationsAttempted: 0,
    });
    expect(service.cohortInserts).toHaveLength(2);
    expect(notifyServer).toHaveBeenCalledTimes(31);
    expect(service.profileUpdates.map((update) => update.tier)).toEqual([2, 0]);
  });

  it('returns 500 instead of building cohorts when active-user loading fails', async () => {
    const service = makeService({ analyticsError: true });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const response = await GET(request('test-secret'));

    expect(response.status).toBe(500);
    expect(service.cohortInserts).toHaveLength(0);
    expect(notifyServer).not.toHaveBeenCalled();
  });
});

describe('weekly league deployment wiring', () => {
  it('registers the Hobby-compatible daily cron and admits its notification kind', () => {
    const vercel = JSON.parse(
      readFileSync(new URL('../../../../../../../vercel.json', import.meta.url), 'utf8'),
    ) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toContainEqual({
      path: '/api/cron/rotate-leagues',
      schedule: '0 0 * * *',
    });

    const sql = readFileSync(
      new URL(
        '../../../../../../../supabase/migrations/20260713122000_league_week_notification.sql',
        import.meta.url,
      ),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(sql).toContain("'day1_comeback', 'league_week_started'");

    const markerSql = readFileSync(
      new URL(
        '../../../../../../../supabase/migrations/20260713121500_league_rotation_marker.sql',
        import.meta.url,
      ),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(markerSql).toContain('create table public.league_rotation_weeks');
    expect(markerSql).toContain(
      'alter table public.league_rotation_weeks enable row level security;',
    );
    expect(markerSql).not.toMatch(/create policy .*league_rotation_weeks/);
  });
});

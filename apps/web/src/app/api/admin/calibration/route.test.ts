import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

import { getProfileForContext } from '@/lib/auth';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

const PERF = '11111111-1111-1111-1111-111111111111';

function makeRequest(): Request {
  return new Request('http://localhost/api/admin/calibration', { method: 'POST' });
}

function mockAdmin() {
  vi.mocked(getRequestContext).mockResolvedValue({
    supabase: {},
    user: { id: 'admin-1' },
  } as unknown as RequestCtx);
  vi.mocked(getProfileForContext).mockResolvedValue({
    id: 'admin-1',
    handle: 'boss',
    role: 'admin',
  } as unknown as Profile);
}

function makeService(opts: {
  anchors?: { performance_id: string; criteria: unknown }[];
  aiBreakdown?: unknown;
}) {
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === 'admin_scores') {
      return { select: vi.fn(async () => ({ data: opts.anchors ?? [], error: null })) };
    }
    if (table === 'scores') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: (opts.anchors ?? []).map((a) => ({
              performance_id: a.performance_id,
              // The refit reads the RAW breakdown, never the calibrated one.
              ai_breakdown_raw: opts.aiBreakdown ?? { vocalAccuracy: 70 },
            })),
          })),
        })),
      };
    }
    if (table === 'scoring_calibration') return { upsert };
    throw new Error(`unexpected table ${table}`);
  });
  return { service: { from } as unknown as Service, upsert };
}

describe('POST /api/admin/calibration — refit from human anchors', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 when the caller is not an admin', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: {},
      user: { id: 'u' },
    } as unknown as RequestCtx);
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'u',
      handle: 'u',
      role: 'user',
    } as unknown as Profile);
    expect((await POST(makeRequest())).status).toBe(403);
  });

  it('refits: mean(anchor − ai) clamped, upserted per criterion', async () => {
    mockAdmin();
    const anchors = Array.from({ length: 5 }, () => ({
      performance_id: PERF,
      criteria: { vocalAccuracy: 95 },
    }));
    const svc = makeService({ anchors, aiBreakdown: { vocalAccuracy: 70 } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      sampleCount: 5,
      offsets: { vocalAccuracy: 10 }, // +25 clamped to +10
    });
    expect(svc.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ criterion: 'vocalAccuracy', offset_value: 10, sample_count: 5 }),
      { onConflict: 'criterion' },
    );
  });

  it('with no anchors: returns empty offsets and writes nothing', async () => {
    mockAdmin();
    const svc = makeService({ anchors: [] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest());

    await expect(res.json()).resolves.toEqual({ sampleCount: 0, offsets: {} });
    expect(svc.upsert).not.toHaveBeenCalled();
  });
});

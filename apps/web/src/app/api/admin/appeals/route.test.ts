import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));
vi.mock('@/lib/performance-create', () => ({
  createScoredPerformance: vi.fn(),
  DuplicateVideoError: class DuplicateVideoError extends Error {},
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { createScoredPerformance, DuplicateVideoError } from '@/lib/performance-create';
import { POST } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

const APPEAL_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';
const REQUEST_ID = '33333333-3333-3333-3333-333333333333';

function makeRequest(body: unknown = { appealId: APPEAL_ID, action: 'uphold' }): Request {
  return new Request('http://localhost/api/admin/appeals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxFor(userId: string): RequestCtx {
  return { supabase: {}, user: { id: userId } } as unknown as RequestCtx;
}

function mockAdmin() {
  vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
  vi.mocked(getProfileForContext).mockResolvedValue({ id: 'admin-1', handle: 'a', role: 'admin' });
}

function makeService(opts: {
  appealRow?: unknown;
  requestRow?: unknown;
  performancesUpdateError?: unknown;
  requestsUpdateError?: unknown;
  appealsUpdateError?: unknown;
}) {
  const appealsUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: opts.appealsUpdateError ?? null })),
  }));
  const appealsAuditInsert = vi.fn(async () => ({ error: null }));
  const performancesUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: opts.performancesUpdateError ?? null })),
  }));
  const requestsUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: opts.requestsUpdateError ?? null })),
  }));

  const appealMaybeSingle = vi.fn(async () => ({
    data:
      'appealRow' in opts
        ? opts.appealRow
        : { id: APPEAL_ID, target_type: 'performance', target_id: TARGET_ID, status: 'pending' },
    error: null,
  }));
  const requestMaybeSingle = vi.fn(async () => ({
    data: 'requestRow' in opts ? opts.requestRow : null,
    error: null,
  }));

  const from = vi.fn((table: string) => {
    if (table === 'appeals') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: appealMaybeSingle }) }),
        update: appealsUpdate,
      };
    }
    if (table === 'appeals_audit') {
      return { insert: appealsAuditInsert };
    }
    if (table === 'performances') {
      return { update: performancesUpdate };
    }
    if (table === 'performance_requests') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: requestMaybeSingle }) }),
        update: requestsUpdate,
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    service: { from } as unknown as Service,
    appealsUpdate,
    appealsAuditInsert,
    performancesUpdate,
    requestsUpdate,
  };
}

describe('POST /api/admin/appeals', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(403);
  });

  it('403 when the caller is not an admin', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('user-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({ id: 'user-1', handle: 'u', role: 'user' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('422 when denying without a resolution note', async () => {
    mockAdmin();
    const res = await POST(makeRequest({ appealId: APPEAL_ID, action: 'deny' }));
    expect(res.status).toBe(422);
  });

  it('404 when the appeal does not exist', async () => {
    mockAdmin();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ appealRow: null }).service,
    );
    expect((await POST(makeRequest())).status).toBe(404);
  });

  it('409 when the appeal has already been reviewed', async () => {
    mockAdmin();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({
        appealRow: {
          id: APPEAL_ID,
          target_type: 'performance',
          target_id: TARGET_ID,
          status: 'upheld',
        },
      }).service,
    );
    expect((await POST(makeRequest())).status).toBe(409);
  });

  it('deny stores the reviewer, resolution note, and an audit row', async () => {
    mockAdmin();
    const svc = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(
      makeRequest({ appealId: APPEAL_ID, action: 'deny', resolutionNote: 'not a mistake' }),
    );

    expect(res.status).toBe(200);
    expect(svc.appealsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'denied',
        reviewer_id: 'admin-1',
        resolution_note: 'not a mistake',
      }),
    );
    expect(svc.appealsAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ appeal_id: APPEAL_ID, action: 'denied', actor: 'admin-1' }),
    );
    expect(svc.performancesUpdate).not.toHaveBeenCalled();
  });

  it('uphold on a performance un-hides it and marks the appeal upheld', async () => {
    mockAdmin();
    const svc = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(svc.performancesUpdate).toHaveBeenCalledWith({ status: 'active' });
    expect(svc.appealsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'upheld', reviewer_id: 'admin-1' }),
    );
    expect(svc.appealsAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'upheld' }),
    );
  });

  it('500 and no finalize when un-hiding the performance fails', async () => {
    mockAdmin();
    const svc = makeService({ performancesUpdateError: { message: 'boom' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(svc.appealsUpdate).not.toHaveBeenCalled();
  });

  it('uphold on a performance_request: 404 when the target request is gone', async () => {
    mockAdmin();
    const svc = makeService({
      appealRow: {
        id: APPEAL_ID,
        target_type: 'performance_request',
        target_id: REQUEST_ID,
        status: 'pending',
      },
      requestRow: null,
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    expect((await POST(makeRequest())).status).toBe(404);
  });

  it('uphold on a performance_request: 409 when the request is not rejected', async () => {
    mockAdmin();
    const svc = makeService({
      appealRow: {
        id: APPEAL_ID,
        target_type: 'performance_request',
        target_id: REQUEST_ID,
        status: 'pending',
      },
      requestRow: {
        id: REQUEST_ID,
        user_id: 'requester-1',
        youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
        category: 'pop',
        status: 'approved',
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    expect((await POST(makeRequest())).status).toBe(409);
    expect(createScoredPerformance).not.toHaveBeenCalled();
  });

  it('uphold on a performance_request re-runs the pipeline for the ORIGINAL requester', async () => {
    mockAdmin();
    const svc = makeService({
      appealRow: {
        id: APPEAL_ID,
        target_type: 'performance_request',
        target_id: REQUEST_ID,
        status: 'pending',
      },
      requestRow: {
        id: REQUEST_ID,
        user_id: 'requester-1',
        youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
        category: 'pop',
        status: 'rejected',
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(createScoredPerformance).mockResolvedValue({ id: 'perf-revived' });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, performanceId: 'perf-revived' });
    expect(createScoredPerformance).toHaveBeenCalledWith(
      svc.service,
      expect.objectContaining({ userId: 'requester-1', category: 'pop' }),
    );
    expect(svc.requestsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', approved_performance_id: 'perf-revived' }),
    );
    expect(svc.appealsUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'upheld' }));
  });

  it('502 and the appeal stays pending when the pipeline fails on uphold', async () => {
    mockAdmin();
    const svc = makeService({
      appealRow: {
        id: APPEAL_ID,
        target_type: 'performance_request',
        target_id: REQUEST_ID,
        status: 'pending',
      },
      requestRow: {
        id: REQUEST_ID,
        user_id: 'requester-1',
        youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
        category: 'pop',
        status: 'rejected',
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(createScoredPerformance).mockRejectedValue(new DuplicateVideoError());

    const res = await POST(makeRequest());

    expect(res.status).toBe(502);
    expect(svc.appealsUpdate).not.toHaveBeenCalled();
    expect(svc.requestsUpdate).not.toHaveBeenCalled();
  });

  it('uphold on a comment has no target mutation but still resolves the appeal', async () => {
    mockAdmin();
    const svc = makeService({
      appealRow: {
        id: APPEAL_ID,
        target_type: 'comment',
        target_id: TARGET_ID,
        status: 'pending',
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(svc.performancesUpdate).not.toHaveBeenCalled();
    expect(svc.appealsUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'upheld' }));
  });
});

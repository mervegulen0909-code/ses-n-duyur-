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
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { createScoredPerformance, DuplicateVideoError } from '@/lib/performance-create';
import { trackServer } from '@/lib/analytics-server';
import { POST } from './route';

const REQUEST_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(body: unknown = { requestId: REQUEST_ID, action: 'approve' }): Request {
  return new Request('http://localhost/api/admin/performance-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function ctxFor(userId: string): RequestCtx {
  return { supabase: {}, user: { id: userId } } as unknown as RequestCtx;
}

function makeService(opts: {
  requestRow?: unknown;
  updateResult?: { error: unknown };
}): { service: Service; update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> } {
  const maybeSingle = vi.fn(async () => ({
    data:
      'requestRow' in opts
        ? opts.requestRow
        : {
            id: REQUEST_ID,
            user_id: 'requester-1',
            youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
            category: 'pop',
            status: 'pending',
          },
    error: null,
  }));
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const eq = vi.fn(async () => opts.updateResult ?? { error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, update }));
  return { service: { from } as unknown as Service, update, eq };
}

describe('POST /api/admin/performance-requests — approve/reject', () => {
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

  it('403 when the caller is not an admin (approve)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('user-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'user-1',
      handle: 'u',
      role: 'user',
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(createScoredPerformance).not.toHaveBeenCalled();
  });

  it('403 when the caller is not an admin (reject)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('user-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'user-1',
      handle: 'u',
      role: 'user',
    });
    const res = await POST(
      makeRequest({ requestId: REQUEST_ID, action: 'reject', rejectionReason: 'low quality' }),
    );
    expect(res.status).toBe(403);
  });

  it('422 on invalid input (missing rejectionReason for reject)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    const res = await POST(makeRequest({ requestId: REQUEST_ID, action: 'reject' }));
    expect(res.status).toBe(422);
  });

  it('404 when the request does not exist', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ requestRow: null }).service,
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('409 when the request has already been reviewed', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({
        requestRow: {
          id: REQUEST_ID,
          user_id: 'requester-1',
          youtube_url: 'x',
          category: 'pop',
          status: 'approved',
        },
      }).service,
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
  });

  it('reject stores the reason and reviewer', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    const { service, update, eq } = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(
      makeRequest({ requestId: REQUEST_ID, action: 'reject', rejectionReason: 'low quality' }),
    );

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        reviewer_id: 'admin-1',
        rejection_reason: 'low quality',
      }),
    );
    expect(eq).toHaveBeenCalledWith('id', REQUEST_ID);
    expect(createScoredPerformance).not.toHaveBeenCalled();
  });

  it('approve creates the performance for the REQUESTER and marks approved', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    const { service, update } = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    vi.mocked(createScoredPerformance).mockResolvedValue({ id: 'perf-new' });

    const res = await POST(makeRequest());

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'perf-new' });
    expect(createScoredPerformance).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ userId: 'requester-1', category: 'pop' }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', approved_performance_id: 'perf-new' }),
    );
    expect(trackServer).toHaveBeenCalledWith(
      service,
      'performance_request_approved',
      'requester-1',
      expect.objectContaining({ requestId: REQUEST_ID }),
    );
  });

  it('auto-rejects on a duplicate video and returns 409', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    const { service, update } = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    vi.mocked(createScoredPerformance).mockRejectedValue(new DuplicateVideoError());

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', rejection_reason: 'duplicate video' }),
    );
  });

  it('leaves the request pending on an unexpected pipeline failure and returns 502', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    const { service, update } = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    vi.mocked(createScoredPerformance).mockRejectedValue(new Error('scoring boom'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(502);
    expect(update).not.toHaveBeenCalled();
  });
});

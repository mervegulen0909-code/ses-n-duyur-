import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));
vi.mock('@/lib/performance-create', async () => {
  class DuplicateVideoError extends Error {}
  class OEmbedFetchError extends Error {}
  return {
    createScoredPerformance: vi.fn(async () => ({ id: 'perf-new' })),
    repairMissingInitialScores: vi.fn(async () => {}),
    DuplicateVideoError,
    OEmbedFetchError,
  };
});

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
import {
  createScoredPerformance,
  DuplicateVideoError,
  OEmbedFetchError,
  repairMissingInitialScores,
} from '@/lib/performance-create';
import { GET, POST } from './route';

const VALID_BODY = {
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  category: 'pop',
};

function makeRequest(body: unknown = VALID_BODY, method = 'POST'): Request {
  return new Request('http://localhost/api/performance-requests', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

function makeUserClient() {
  const order = vi.fn(async () => ({ data: [], error: null }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { supabase: { from } as unknown, from };
}

function makeService(opts: { existingPerf?: unknown; existingPending?: unknown } = {}): Service {
  const from = vi.fn((table: string) => {
    if (table === 'performance_requests') {
      const single = vi.fn(async () => ({ data: { id: 'req-audit' }, error: null }));
      const insert = vi.fn(() => ({ select: () => ({ single }) }));
      return { insert };
    }
    const maybeSingle = vi.fn(async () => ({ data: opts.existingPerf ?? null, error: null }));
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    return { select };
  });
  return { from } as unknown as Service;
}

describe('POST /api/performance-requests — automatic add', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('422 on invalid input (missing category)', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(makeRequest({ youtubeUrl: VALID_BODY.youtubeUrl }));
    expect(res.status).toBe(422);
  });

  it('422 on an invalid YouTube URL', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(makeRequest({ youtubeUrl: 'https://example.com', category: 'pop' }));
    expect(res.status).toBe(422);
  });

  it('422 on an invalid category value', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(
      makeRequest({ youtubeUrl: VALID_BODY.youtubeUrl, category: 'not-a-real-category' }),
    );
    expect(res.status).toBe(422);
  });

  it('409 when the video is already an active performance', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ existingPerf: { id: 'perf-1' } }),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(createScoredPerformance).not.toHaveBeenCalled();
  });

  it('409 when the create pipeline detects a duplicate race', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService());
    vi.mocked(createScoredPerformance).mockRejectedValueOnce(new DuplicateVideoError());

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
  });

  it('422 when YouTube metadata cannot be verified', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService());
    vi.mocked(createScoredPerformance).mockRejectedValueOnce(new OEmbedFetchError('metadata'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(422);
  });

  it('201 happy path creates an active performance and approved audit row', async () => {
    const user = makeUserClient();
    const service = makeService();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'perf-new', requestId: 'req-audit' });
    expect(createScoredPerformance).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        userId: 'u1',
        youtubeUrl: VALID_BODY.youtubeUrl,
        category: 'pop',
      }),
    );
    const from = vi.mocked(service.from);
    expect(from).toHaveBeenCalledWith('performance_requests');
    const requestInsert = from.mock.results.find(
      (result) => result.value && 'insert' in (result.value as object),
    )?.value as { insert: ReturnType<typeof vi.fn> };
    expect(requestInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        youtube_video_id: 'dQw4w9WgXcQ',
        category: 'pop',
        status: 'approved',
        approved_performance_id: 'perf-new',
      }),
    );
    expect(trackServer).toHaveBeenCalledWith(
      expect.anything(),
      'performance_request_approved',
      'u1',
      expect.objectContaining({ category: 'pop', performanceId: 'perf-new', automatic: 1 }),
    );
  });
});

describe('GET /api/performance-requests — my requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await GET(makeRequest(undefined, 'GET'))).status).toBe(401);
  });

  it('200 returns the caller-scoped list', async () => {
    const order = vi.fn(async () => ({
      data: [{ id: 'req-1', status: 'approved', approved_performance_id: 'perf-1' }],
      error: null,
    }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: { from },
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await GET(makeRequest(undefined, 'GET'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      requests: [{ id: 'req-1', status: 'approved' }],
    });
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(repairMissingInitialScores).toHaveBeenCalledWith(service, ['perf-1']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/analysis-signature', () => ({
  newAnalysisNonce: vi.fn(() => 'nonce-fixture'),
  signAnalysisUploadClaims: vi.fn(() => 'signed-upload-token'),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';
const REFERENCE = '33333333-3333-3333-3333-333333333333';
const SESSION = '44444444-4444-4444-4444-444444444444';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/analysis/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { performanceId: PERF, mode: 'song_reference' };

function makeCtx(userId = 'me') {
  const maybeSingle = vi.fn(async () => ({
    data: { id: PERF, user_id: userId, song_id: 'song-1', status: 'active' },
  }));
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
  return { supabase: { from }, user: { id: 'me' } } as unknown as RequestCtx;
}

function makeService(opts: { insertError?: { code: string } | null } = {}) {
  const rpc = vi.fn(async () => ({ error: null }));

  const insertSingle = vi.fn(async () =>
    opts.insertError
      ? { data: null, error: opts.insertError }
      : { data: { id: SESSION }, error: null },
  );
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));

  const scoreIs = vi.fn(async () => ({ error: null }));
  const scoreEq = vi.fn(() => ({ is: scoreIs }));
  const scoreUpdate = vi.fn(() => ({ eq: scoreEq }));

  const referenceMaybeSingle = vi.fn(async () => ({ data: { id: REFERENCE } }));

  const from = vi.fn((table: string) => {
    if (table === 'song_references') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: referenceMaybeSingle }) }) }),
      };
    }
    if (table === 'analysis_sessions') return { insert };
    if (table === 'scores') return { update: scoreUpdate };
    return {};
  });

  return {
    service: { from, rpc } as unknown as Service,
    from,
    rpc,
    scoreUpdate,
    scoreIs,
    insert,
  };
}

describe('POST /api/analysis/sessions', () => {
  beforeEach(() => {
    process.env.ANALYZER_URL = 'https://analyzer.example';
  });

  afterEach(() => {
    delete process.env.ANALYZER_URL;
    vi.clearAllMocks();
  });

  it('expires stale active sessions (and unsticks their score) before inserting', async () => {
    const service = makeService();
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.service);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { sessionId: string; uploadUrl: string };
    expect(json.sessionId).toBe(SESSION);
    expect(json.uploadUrl).toBe('https://analyzer.example/analyze');

    expect(service.rpc).toHaveBeenCalledWith('expire_stale_analysis_sessions', {
      p_performance_id: PERF,
    });

    const sweepOrder = service.rpc.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    const insertOrder = service.insert.mock.invocationCallOrder[0] ?? 0;
    expect(sweepOrder).toBeLessThan(insertOrder);
  });

  it('only parks never-scored rows in analysis_pending (provisional stays visible)', async () => {
    const service = makeService();
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.service);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    // The score-status flip must be constrained to rows with no score yet.
    expect(service.scoreUpdate).toHaveBeenCalledWith({
      score_status: 'analysis_pending',
      score_source: 'none',
    });
    expect(service.scoreIs).toHaveBeenCalledWith('initial_ai_score', null);
  });

  it('still returns 409 when a non-expired session is active', async () => {
    const service = makeService({ insertError: { code: '23505' } });
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.service);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('An analysis is already in progress');
  });

  it('rejects performances the caller does not own', async () => {
    const service = makeService();
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('someone-else'));
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.service);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    expect(service.rpc).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (hoisted above imports by Vitest) -------------------------

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));

import { CRITERIA } from '@voxscore/scoring';
import { encodeWav } from '@voxscore/dsp';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF_ID = '9c5f8e4a-1234-4abc-9def-0123456789ab';

// Real synthetic audio through the REAL dsp pipeline — no DSP mocking, so this
// test proves the endpoint measures actual WAV bytes end-to-end.
function sine(freqHz: number, seconds: number, sr = 16000): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freqHz * i) / sr);
  return out;
}
const wavBytes = () => encodeWav(sine(220, 3), 16000);

function makeRequest(
  body: BodyInit | null = wavBytes() as unknown as BodyInit,
  {
    performanceId = PERF_ID,
    contentLength,
  }: { performanceId?: string; contentLength?: string } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'audio/wav' };
  if (contentLength) headers['content-length'] = contentLength;
  return new Request(`http://localhost/api/measurements?performanceId=${performanceId}`, {
    method: 'POST',
    headers,
    body,
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

// User-scoped context: performances select resolves to `perfRow`.
function makeUserClient(perfRow: unknown) {
  const maybeSingle = vi.fn(async () => ({ data: perfRow, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const ctx = { supabase: { from }, user: { id: 'user-1' } };
  return { ctx: ctx as unknown as RequestCtx, from };
}

const OWNED_PERF = { id: PERF_ID, user_id: 'user-1', has_video: true, status: 'active' };

// Service client covering the route's three tables.
function makeServiceClient(opts: { upsertResult?: { error: unknown } } = {}) {
  const upsert = vi.fn(async () => opts.upsertResult ?? { error: null });
  const aiBreakdown = Object.fromEntries(CRITERIA.map((c) => [c, 70]));
  const scoreMaybeSingle = vi.fn(async () => ({
    data: { initial_ai_score: 70, ai_breakdown: aiBreakdown },
    error: null,
  }));
  const scoreSelectEq = vi.fn(() => ({ maybeSingle: scoreMaybeSingle }));
  const scoreSelect = vi.fn(() => ({ eq: scoreSelectEq }));
  const scoreUpdateEq = vi.fn(async () => ({ error: null }));
  const scoreUpdate = vi.fn(() => ({ eq: scoreUpdateEq }));
  const ratingsEq = vi.fn(async () => ({ data: [], error: null }));
  const ratingsSelect = vi.fn(() => ({ eq: ratingsEq }));
  const from = vi.fn((table: string) => {
    if (table === 'measured_scores') return { upsert };
    if (table === 'scores') return { select: scoreSelect, update: scoreUpdate };
    return { select: ratingsSelect };
  });
  return { client: { from } as unknown as ServiceClient, upsert, scoreUpdate };
}

function authAs(perfRow: unknown = OWNED_PERF) {
  const user = makeUserClient(perfRow);
  vi.mocked(getRequestContext).mockResolvedValue(user.ctx);
  return user;
}

describe('POST /api/measurements — measure and delete (ADR 0003)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient().client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('rejects a missing/invalid performanceId with 422', async () => {
    const res = await POST(
      makeRequest(wavBytes() as unknown as BodyInit, { performanceId: 'nope' }),
    );
    expect(res.status).toBe(422);
  });

  it('requires authentication (401)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 503 when the service client is unavailable (measured scores are server-only)', async () => {
    authAs();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it('returns 404 for a missing performance', async () => {
    authAs(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-active performance', async () => {
    authAs({ ...OWNED_PERF, status: 'hidden' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it("rejects a recording for someone else's performance (403)", async () => {
    authAs({ ...OWNED_PERF, user_id: 'someone-else' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('rejects an oversized declared body with 413 before reading it', async () => {
    authAs();
    const res = await POST(
      makeRequest(wavBytes() as unknown as BodyInit, { contentLength: String(50 * 1024 * 1024) }),
    );
    expect(res.status).toBe(413);
  });

  it('rejects an empty body with 400', async () => {
    authAs();
    const res = await POST(makeRequest(new Uint8Array(0) as unknown as BodyInit));
    expect(res.status).toBe(400);
  });

  it('surfaces DSP parse errors for non-WAV bytes as 422', async () => {
    authAs();
    const res = await POST(makeRequest(new Uint8Array([1, 2, 3]) as unknown as BodyInit));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/WAV/);
  });

  it('returns 500 when the measurement cannot be stored', async () => {
    authAs();
    const service = makeServiceClient({ upsertResult: { error: { message: 'boom' } } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('measures real WAV bytes, stores the breakdown, and re-blends the score (201)', async () => {
    authAs();
    const service = makeServiceClient();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      ok: boolean;
      audioStored: boolean;
      breakdown: Record<string, number>;
      features: Record<string, unknown>;
    };
    // The honesty contract: the audio is never retained.
    expect(body.audioStored).toBe(false);
    // Exactly the objective criteria are measured (Hard Rule 6 split).
    expect(Object.keys(body.breakdown).sort()).toEqual([
      'recordingQuality',
      'rhythmTiming',
      'technicalSkill',
      'vocalAccuracy',
    ]);
    for (const value of Object.values(body.breakdown)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    // Stored row mirrors the response.
    expect(service.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        performance_id: PERF_ID,
        user_id: 'user-1',
        dsp_version: 1,
        measured_breakdown: body.breakdown,
      }),
      { onConflict: 'performance_id' },
    );

    // The denormalized score was re-blended with the measured basis.
    expect(service.scoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ current_score: expect.any(Number), trend_score: 0 }),
    );
  });
});

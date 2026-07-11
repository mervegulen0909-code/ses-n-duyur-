import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase client factories — controlled per-test via vi.mocked(...).
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

// Guards pass through (rate-limit / bot-check are covered elsewhere). null = "not blocked".
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));

// The pipeline itself is covered by performance-create.test.ts — this route
// only needs to prove it's admin-gated and wires the pipeline's result/errors
// through to the right HTTP status.
vi.mock('@/lib/performance-create', () => ({
  createScoredPerformance: vi.fn(),
  DuplicateVideoError: class DuplicateVideoError extends Error {},
  OEmbedFetchError: class OEmbedFetchError extends Error {},
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import {
  createScoredPerformance,
  DuplicateVideoError,
  OEmbedFetchError,
} from '@/lib/performance-create';
import { POST } from './route';

const VALID_BODY = { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' };

function makeRequest(body: unknown = VALID_BODY): Request {
  return new Request('http://localhost/api/performances', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

function ctxFor(userId: string): RequestCtx {
  return { supabase: {}, user: { id: userId } } as unknown as RequestCtx;
}

describe('POST /api/performances — admin-only curated/seed path', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createSupabaseServiceClient).mockReturnValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(createScoredPerformance).not.toHaveBeenCalled();
  });

  it('returns 403 and creates nothing when the caller is not an admin', async () => {
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

  it('returns 201 with the new id for an admin', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    vi.mocked(createScoredPerformance).mockResolvedValue({ id: 'perf-ok' });

    const res = await POST(makeRequest());

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'perf-ok' });
    expect(createScoredPerformance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'admin-1', youtubeUrl: VALID_BODY.youtubeUrl }),
    );
  });

  it('returns 409 when the pipeline reports a duplicate video', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    vi.mocked(createScoredPerformance).mockRejectedValue(new DuplicateVideoError());

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
  });

  it('returns 502 when the pipeline cannot fetch oEmbed metadata', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    vi.mocked(createScoredPerformance).mockRejectedValue(new OEmbedFetchError('boom'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(502);
  });

  it('returns 503 and never calls the pipeline when the service client is missing', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctxFor('admin-1'));
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'admin-1',
      handle: 'a',
      role: 'admin',
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    expect(createScoredPerformance).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});

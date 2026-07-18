import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

const ctx = { supabase: {}, user: { id: 'me' } } as unknown as RequestCtx;

function makeRequest(body: Record<string, unknown> = { performanceId: PERF }): Request {
  return new Request('http://localhost/api/performances/report-unplayable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Mock the service client: a performances lookup + an update.eq(). */
function makeService(perf: Record<string, unknown> | null): {
  service: Service;
  update: ReturnType<typeof vi.fn>;
} {
  const maybeSingle = vi.fn(async () => ({ data: perf }));
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({ select, update }));
  return { service: { from } as unknown as Service, update };
}

/** Stub the YouTube Data API videos.list response. */
function stubYoutube(items: { id: string; embeddable: boolean }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: items.map((i) => ({ id: i.id, status: { embeddable: i.embeddable } })),
      }),
    })),
  );
}

describe('POST /api/performances/report-unplayable', () => {
  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = 'yt-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('422 on a non-uuid performanceId', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest({ performanceId: 'nope' }))).status).toBe(422);
  });

  it('flags the performance when YouTube confirms it is NOT embeddable', async () => {
    const { service, update } = makeService({
      id: PERF,
      youtube_video_id: 'vid1',
      embed_unplayable_at: null,
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    stubYoutube([{ id: 'vid1', embeddable: false }]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, flagged: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ embed_unplayable_at: expect.any(String) }),
    );
  });

  it('does NOT flag when YouTube says the video IS embeddable (anti-grief)', async () => {
    const { service, update } = makeService({
      id: PERF,
      youtube_video_id: 'vid1',
      embed_unplayable_at: null,
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    stubYoutube([{ id: 'vid1', embeddable: true }]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, flagged: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('does NOT flag when the status check is unverifiable (no API key)', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const { service, update } = makeService({
      id: PERF,
      youtube_video_id: 'vid1',
      embed_unplayable_at: null,
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, flagged: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-flagged performance (no re-check)', async () => {
    const { service, update } = makeService({
      id: PERF,
      youtube_video_id: 'vid1',
      embed_unplayable_at: '2026-07-18T00:00:00.000Z',
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, flagged: true });
    expect(update).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops for an unknown performance or one without a video', async () => {
    const { service, update } = makeService(null);
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, flagged: false });
    expect(update).not.toHaveBeenCalled();
  });
});

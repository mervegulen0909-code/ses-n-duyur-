import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));
vi.mock('@/lib/streak-server', () => ({
  currentListenStreak: vi.fn(async () => 0),
}));
vi.mock('@/lib/badges', () => ({
  grantBadge: vi.fn(async () => {}),
}));
vi.mock('@/lib/league-points', () => ({
  addLeaguePoints: vi.fn(async () => {}),
}));
// Keep the real validateListen / constants; only stub the network duration fetch.
vi.mock('@voxscore/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@voxscore/core')>()),
  fetchVideoDurationSeconds: vi.fn(),
}));

import { fetchVideoDurationSeconds } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
import { currentListenStreak } from '@/lib/streak-server';
import { grantBadge } from '@/lib/badges';
import { addLeaguePoints } from '@/lib/league-points';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';
const LISTEN = '22222222-2222-2222-2222-222222222222';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/listens/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  performanceId: PERF,
  listenId: LISTEN,
  durationS: 200,
  events: [{ kind: 'ended', atSeconds: 200, clientTs: 5 }],
};

const ownedListen = {
  id: LISTEN,
  user_id: 'me',
  performance_id: PERF,
  created_at: '2026-06-24T12:00:00.000Z',
  is_valid: false,
  watched_pct: 0,
};

function makeCtx(userId = 'me', listen: Record<string, unknown> | null = ownedListen) {
  const maybeSingle = vi.fn(async () => ({ data: listen }));
  const from = vi.fn((table: string) => {
    if (table === 'verified_listens') return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    return {};
  });
  return { supabase: { from }, user: { id: userId } } as unknown as RequestCtx;
}

const defaultPerf = { id: PERF, youtube_video_id: 'vid12345678', duration_s: 200 };

function makeService(
  opts: {
    updateError?: unknown;
    finalized?: { id: string } | null;
    perf?: Record<string, unknown> | null;
  } = {},
) {
  // verified_listens finalize chain: update().eq().eq().select().maybeSingle()
  const updateMaybeSingle = vi.fn(async () => ({
    data: 'finalized' in opts ? opts.finalized : { id: LISTEN },
    error: opts.updateError ?? null,
  }));
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateValidEq = vi.fn(() => ({ select: updateSelect }));
  const updateEq = vi.fn(() => ({ eq: updateValidEq }));
  const update = vi.fn(() => ({ eq: updateEq }));

  // performances read: select().eq().maybeSingle()
  const perf = 'perf' in opts ? opts.perf : defaultPerf;
  const perfMaybeSingle = vi.fn(async () => ({ data: perf }));
  const perfSelect = vi.fn(() => ({ eq: () => ({ maybeSingle: perfMaybeSingle }) }));
  // performances duration cache: update().eq()
  const perfUpdateEq = vi.fn(async () => ({ error: null }));
  const perfUpdate = vi.fn(() => ({ eq: perfUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === 'performances') return { select: perfSelect, update: perfUpdate };
    return { update };
  });
  return {
    service: { from } as unknown as Service,
    update,
    updateEq,
    updateValidEq,
    updateSelect,
    perfUpdate,
    perfUpdateEq,
  };
}

describe('POST /api/listens/complete — server-side anti-cheat wiring', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on invalid input (empty event trail)', async () => {
    expect((await POST(makeRequest({ ...validBody, events: [] }))).status).toBe(422);
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(401);
  });

  it('404 when the listen session does not exist', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', null));
    expect((await POST(makeRequest(validBody))).status).toBe(404);
  });

  it('404 when the listen belongs to a different user', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(
      makeCtx('me', { ...ownedListen, user_id: 'other' }),
    );
    expect((await POST(makeRequest(validBody))).status).toBe(404);
  });

  it('404 when the listen is for a different performance', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(
      makeCtx('me', { ...ownedListen, performance_id: '99999999-9999-9999-9999-999999999999' }),
    );
    expect((await POST(makeRequest(validBody))).status).toBe(404);
  });

  it('503 when the service role is unavailable (cannot validate)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(503);
  });

  it('500 when the is_valid update fails', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ updateError: { message: 'x' } }).service,
    );
    expect((await POST(makeRequest(validBody))).status).toBe(500);
  });

  it('persists is_valid (server-decided) via the service role and returns the verdict', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    const svc = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { isValid: boolean; watchedPct: number };
    expect(typeof json.isValid).toBe('boolean');
    expect(typeof json.watchedPct).toBe('number');
    // The server writes the verdict it computed (the client can never set it).
    expect(svc.update).toHaveBeenCalledWith(expect.objectContaining({ is_valid: json.isValid }));
    expect(svc.updateEq).toHaveBeenCalledWith('id', LISTEN);
    expect(svc.updateValidEq).toHaveBeenCalledWith('is_valid', false);
    // This body's single event yields 0% coverage — never a Verified Listen.
    expect(json.isValid).toBe(false);
    expect(trackServer).not.toHaveBeenCalled();
  });

  it('rejects a 30s partial watch that is far under the full-listen threshold', async () => {
    // 31s of a 200s video = 16% — genuine, but not a full listen (Hard Rule 4/5).
    vi.mocked(getRequestContext).mockResolvedValue(
      makeCtx('me', { ...ownedListen, created_at: new Date(Date.now() - 40_000).toISOString() }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const res = await POST(
      makeRequest({
        ...validBody,
        events: [
          { kind: 'playing', atSeconds: 0, clientTs: 0 },
          { kind: 'playing', atSeconds: 31, clientTs: 31_000 },
        ],
      }),
    );

    const json = (await res.json()) as { isValid: boolean; watchedPct: number; reason: string };
    expect(json.isValid).toBe(false);
    expect(json.watchedPct).toBeCloseTo(0.155, 3);
    expect(json.reason).toMatch(/16% < required 90%/);
  });

  it('accepts a genuine full watch (>=90% of the trusted length)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(
      makeCtx('me', { ...ownedListen, created_at: new Date(Date.now() - 200_000).toISOString() }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const events: { kind: 'playing'; atSeconds: number; clientTs: number }[] = [];
    for (let s = 0; s <= 190; s += 10)
      events.push({ kind: 'playing', atSeconds: s, clientTs: s * 1000 });
    const res = await POST(makeRequest({ ...validBody, events }));

    const json = (await res.json()) as { isValid: boolean; watchedPct: number };
    expect(json.isValid).toBe(true);
    expect(json.watchedPct).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects playback shorter than the 30s anti-bot floor', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(
      makeCtx('me', { ...ownedListen, created_at: new Date(Date.now() - 40_000).toISOString() }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const res = await POST(
      makeRequest({
        ...validBody,
        events: [
          { kind: 'playing', atSeconds: 0, clientTs: 0 },
          { kind: 'playing', atSeconds: 5, clientTs: 5_000 },
        ],
      }),
    );

    const json = (await res.json()) as { isValid: boolean; reason: string };
    expect(json.isValid).toBe(false);
    expect(json.reason).toMatch(/required 30s/);
  });

  it('fires verified_listen_completed analytics only when the listen is actually valid', async () => {
    const recentListen = {
      ...ownedListen,
      created_at: new Date(Date.now() - 210_000).toISOString(),
    };
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen));
    const svc = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(
      makeRequest({
        ...validBody,
        durationS: 200,
        events: [
          { kind: 'playing', atSeconds: 0, clientTs: 0 },
          { kind: 'ended', atSeconds: 200, clientTs: 200_000 },
        ],
      }),
    );

    const json = (await res.json()) as { isValid: boolean };
    expect(json.isValid).toBe(true);
    expect(trackServer).toHaveBeenCalledWith(svc.service, 'verified_listen_completed', 'me', {
      performanceId: PERF,
    });
  });

  const validListenBody = {
    ...validBody,
    events: [
      { kind: 'playing', atSeconds: 0, clientTs: 0 },
      { kind: 'ended', atSeconds: 200, clientTs: 200_000 },
    ],
  };
  const recentListen = () => ({
    ...ownedListen,
    created_at: new Date(Date.now() - 210_000).toISOString(),
  });

  it('grants the Trusted Ear badge for the streak tier on a valid listen (7 days → silver)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen()));
    const svc = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(currentListenStreak).mockResolvedValue(7);

    const res = await POST(makeRequest(validListenBody));

    expect(((await res.json()) as { isValid: boolean }).isValid).toBe(true);
    expect(currentListenStreak).toHaveBeenCalledWith(
      svc.service,
      'me',
      new Date().toISOString().slice(0, 10),
    );
    expect(grantBadge).toHaveBeenCalledTimes(1);
    expect(grantBadge).toHaveBeenCalledWith(svc.service, 'me', 'trusted_ear_silver');
    // A valid verified listen accrues +1 weekly-league point.
    expect(addLeaguePoints).toHaveBeenCalledWith(svc.service, 'me', 1, {
      kind: 'verified_listen',
      id: LISTEN,
    });
  });

  it('grants no badge when the streak is below bronze', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen()));
    const svc = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(currentListenStreak).mockResolvedValue(1);

    await POST(makeRequest(validListenBody));

    expect(grantBadge).not.toHaveBeenCalled();
  });

  it('never touches streaks or badges for an invalid listen', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const res = await POST(makeRequest(validBody));

    expect(((await res.json()) as { isValid: boolean }).isValid).toBe(false);
    expect(currentListenStreak).not.toHaveBeenCalled();
    expect(grantBadge).not.toHaveBeenCalled();
    expect(addLeaguePoints).not.toHaveBeenCalled();
  });

  it('returns an already-valid listen without replaying any side effects', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(
      makeCtx('me', { ...recentListen(), is_valid: true, watched_pct: 96 }),
    );

    const res = await POST(makeRequest(validListenBody));

    await expect(res.json()).resolves.toEqual({ isValid: true, watchedPct: 0.96, reason: null });
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
    expect(trackServer).not.toHaveBeenCalled();
    expect(addLeaguePoints).not.toHaveBeenCalled();
  });

  it('runs no side effects when another request wins the atomic finalization claim', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen()));
    const svc = makeService({ finalized: null });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest(validListenBody));

    expect(((await res.json()) as { isValid: boolean }).isValid).toBe(true);
    expect(trackServer).not.toHaveBeenCalled();
    expect(currentListenStreak).not.toHaveBeenCalled();
    expect(addLeaguePoints).not.toHaveBeenCalled();
  });

  it('fails closed when the trusted video length cannot be resolved (no vote unlocked)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen()));
    const svc = makeService({
      perf: { id: PERF, youtube_video_id: 'vid12345678', duration_s: null },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(fetchVideoDurationSeconds).mockResolvedValue(null);

    const res = await POST(makeRequest(validListenBody));

    const json = (await res.json()) as { isValid: boolean; reason: string };
    expect(json.isValid).toBe(false);
    expect(json.reason).toMatch(/could not verify the video length/i);
    // Fail-closed writes nothing and runs no side effects — fully retryable.
    expect(svc.update).not.toHaveBeenCalled();
    expect(trackServer).not.toHaveBeenCalled();
    expect(addLeaguePoints).not.toHaveBeenCalled();
  });

  it('fetches the duration from the YouTube API and caches it when missing', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen()));
    const svc = makeService({
      perf: { id: PERF, youtube_video_id: 'vid12345678', duration_s: null },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(fetchVideoDurationSeconds).mockResolvedValue(200);

    const res = await POST(makeRequest(validListenBody));

    expect(((await res.json()) as { isValid: boolean }).isValid).toBe(true);
    expect(fetchVideoDurationSeconds).toHaveBeenCalledWith(
      'vid12345678',
      process.env.YOUTUBE_API_KEY,
    );
    expect(svc.perfUpdate).toHaveBeenCalledWith({ duration_s: 200 });
  });

  it('ignores the client-reported durationS and gates on the trusted length', async () => {
    // Client claims a 30s "video" fully watched; the trusted length is 200s.
    // Shrinking durationS must not fake a full listen (Hard Rule 4).
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me', recentListen()));
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const res = await POST(
      makeRequest({
        ...validBody,
        durationS: 30,
        events: [
          { kind: 'playing', atSeconds: 0, clientTs: 0 },
          { kind: 'playing', atSeconds: 30, clientTs: 30_000 },
        ],
      }),
    );

    const json = (await res.json()) as { isValid: boolean; watchedPct: number };
    expect(json.isValid).toBe(false);
    expect(json.watchedPct).toBeCloseTo(0.15, 2);
  });
});

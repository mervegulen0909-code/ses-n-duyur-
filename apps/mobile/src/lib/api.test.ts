import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The api client talks to the deployed Next.js API. Mock the supabase client so
// importing ./api never pulls in expo-secure-store / native modules, and so we
// can control the session token. fetch is stubbed per-test.
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { supabase } from './supabase';
import {
  addPerformance,
  completeListen,
  deleteAccount,
  nextBattle,
  postComment,
  registerPushToken,
  startListen,
  submitBattleVote,
  submitVote,
} from './api';

const getSession = vi.mocked(supabase.auth.getSession);

/** Stub the next fetch call with a JSON body + status. */
function mockFetchOnce(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

/** The (url, options) of the most recent fetch call. */
function lastFetch(): { url: string; opts: RequestInit } {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
  const [url, opts] = calls[calls.length - 1] as [string, RequestInit];
  return { url, opts };
}

function withSession(token: string | null) {
  getSession.mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
  } as never);
}

describe('mobile api client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    withSession('tok-123');
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('attaches the Supabase access token as a Bearer header', async () => {
    mockFetchOnce({ ok: true });
    await submitVote('p1', 'l1', { vocalAccuracy: 80 });

    const { opts } = lastFetch();
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer tok-123');
    expect((opts.headers as Record<string, string>)['x-voxscore-client']).toBe('mobile-app');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('omits the authorization header when there is no session', async () => {
    withSession(null);
    mockFetchOnce({ listenId: 'L1' });
    await startListen('p1');

    const { opts } = lastFetch();
    expect((opts.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('posts to the right path with a JSON body', async () => {
    mockFetchOnce({ ok: true });
    await postComment('perf-9', 'great vibrato');

    const { url, opts } = lastFetch();
    expect(url).toMatch(/\/api\/comments$/);
    expect(JSON.parse(opts.body as string)).toEqual({
      performanceId: 'perf-9',
      body: 'great vibrato',
    });
  });

  it('startListen returns the listenId, or null when absent', async () => {
    mockFetchOnce({ listenId: 'L42' });
    expect(await startListen('p1')).toBe('L42');

    mockFetchOnce({});
    expect(await startListen('p1')).toBeNull();
  });

  it('completeListen maps isValid + reason', async () => {
    mockFetchOnce({ isValid: true });
    expect(await completeListen('p1', 'l1', 200, [])).toEqual({ isValid: true, reason: null });

    mockFetchOnce({ isValid: false, reason: 'too short' });
    expect(await completeListen('p1', 'l1', 5, [])).toEqual({
      isValid: false,
      reason: 'too short',
    });
  });

  it('submitVote surfaces currentScore and honours ok=false / non-2xx', async () => {
    mockFetchOnce({ ok: true, currentScore: 88.5 });
    expect(await submitVote('p1', 'l1', { toneQuality: 70 })).toMatchObject({
      ok: true,
      status: 200,
      currentScore: 88.5,
    });

    mockFetchOnce({ ok: false, error: 'nope' }, { ok: false, status: 403 });
    expect(await submitVote('p1', 'l1', { toneQuality: 70 })).toMatchObject({
      ok: false,
      status: 403,
      error: 'nope',
    });
  });

  it('registerPushToken sends token + platform and reports ok/status', async () => {
    mockFetchOnce({ ok: true }, { status: 201 });
    const res = await registerPushToken('ExponentPushToken[x]', 'android');

    expect(res).toEqual({ ok: true, status: 201 });
    const { url, opts } = lastFetch();
    expect(url).toMatch(/\/api\/push\/register$/);
    expect(JSON.parse(opts.body as string)).toEqual({
      token: 'ExponentPushToken[x]',
      platform: 'android',
    });
  });

  it('addPerformance is ok only when the server returns an id', async () => {
    mockFetchOnce({ id: 'new-perf' });
    expect(await addPerformance('https://youtu.be/x')).toMatchObject({ ok: true, id: 'new-perf' });

    mockFetchOnce({ error: 'bad url' }, { ok: false, status: 422 });
    expect(await addPerformance('nope')).toMatchObject({ ok: false, status: 422 });
  });

  it('nextBattle passes through the pairing payload', async () => {
    const payload = { battleId: 'b1', a: { performanceId: 'pa' }, b: { performanceId: 'pb' } };
    mockFetchOnce(payload);
    const res = await nextBattle();
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ battleId: 'b1' });
  });

  it('submitBattleVote / deleteAccount honour the ok=false flag', async () => {
    mockFetchOnce({ ok: false, error: 'both sides not listened' }, { ok: false, status: 403 });
    expect(
      await submitBattleVote({
        battleId: 'b1',
        winnerPerformanceId: 'pa',
        listenAId: 'la',
        listenBId: 'lb',
      }),
    ).toMatchObject({ ok: false, status: 403 });

    mockFetchOnce({ ok: true });
    expect(await deleteAccount()).toMatchObject({ ok: true, status: 200 });
  });
});

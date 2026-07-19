import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Real authenticated happy-path E2E, against the actual HTTP boundary and a
 * real (local, empty) Supabase project — not mocks. Requires the local
 * Supabase stack (see .github/workflows/ci.yml "Database migrations from
 * zero" + "E2E (smoke)" steps, or `pnpm db:start && pnpm db:reset` locally)
 * with its URL/keys exported as NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 *
 * Auth is via Bearer token (the same path native/mobile clients use —
 * `getRequestContext` in apps/web/src/lib/supabase/server.ts), so these tests
 * never need to drive a browser UI or the flaky YouTube iframe: they exercise
 * the SERVER gates the UI depends on, with real HTTP + a real DB.
 *
 * No OPENAI_API_KEY/ANTHROPIC_API_KEY/GEMINI_API_KEY is set in CI, so adding a
 * performance scores through @voxscore/core's MockScoringProvider — a real,
 * deterministic code path (not a test-only mock), just not the paid one.
 *
 * No YOUTUBE_API_KEY is set in CI either, so the Verified Listen gate cannot
 * fetch a trusted video length from the YouTube Data API. Rather than skip
 * that gate, each test seeds `performances.duration_s` directly via the
 * service-role client before exercising the listen flow — a fixture step
 * (parallel to supabase/seed.sql seeding songs), not a weakening of
 * validateListen's actual anti-cheat logic under test.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY,
  'requires local Supabase env (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)',
);

const service = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL!, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// Long-standing, effectively-permanent public YouTube videos — distinct per
// test so the unique(youtube_video_id) index never collides between them.
const VIDEO_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO_B = 'https://www.youtube.com/watch?v=9bZkp7q19f0';
const VIDEO_C = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const VIDEO_D = 'https://www.youtube.com/watch?v=kJQP7kiw5Fk';

const FULL_RATINGS = {
  vocalAccuracy: 80,
  rhythmTiming: 75,
  toneQuality: 85,
  emotionInterpretation: 70,
  technicalSkill: 80,
  pronunciationDiction: 75,
  recordingQuality: 90,
  originality: 65,
  stagePresence: 60,
};

async function signUpUser(): Promise<{
  token: string;
  userId: string;
  email: string;
  password: string;
}> {
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
  const email = `e2e-${randomUUID()}@voxscore.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`test signup failed: ${error?.message ?? 'no session returned'}`);
  }
  return { token: data.session.access_token, userId: data.user.id, email, password };
}

/** Bearer-authed request helper, marked as a native client to skip Turnstile
 *  (there is no site key in CI anyway — Noop already passes — but this also
 *  exercises the real mobile-style auth path end to end). */
function authedPost(request: APIRequestContext, token: string) {
  return (url: string, data: unknown) =>
    request.post(url, {
      data,
      headers: { Authorization: `Bearer ${token}`, 'x-voxscore-client': 'mobile-app' },
    });
}

/** A heartbeat event trail: `playing` every 2s from 0 up to `uptoSeconds`,
 *  timestamped against a real start time so it matches genuine elapsed time. */
function heartbeatEvents(startedAt: number, uptoSeconds: number) {
  const events: { kind: 'playing'; atSeconds: number; clientTs: number }[] = [];
  for (let s = 0; s <= uptoSeconds; s += 2) {
    events.push({ kind: 'playing', atSeconds: s, clientTs: startedAt + s * 1000 });
  }
  return events;
}

test.describe('authenticated happy path (real HTTP + real local DB)', () => {
  test('signup -> add performance -> provisional score -> Verified Listen gate -> vote', async ({
    request,
  }) => {
    const author = await signUpUser();
    const voter = await signUpUser();
    const post = authedPost(request, voter.token);

    const addRes = await authedPost(request, author.token)('/api/performance-requests', {
      youtubeUrl: VIDEO_A,
      category: 'other',
    });
    expect(addRes.status()).toBe(201);
    const { id: performanceId } = (await addRes.json()) as { id: string };

    // Provisional AI estimate is visible immediately (public read, anon key).
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { data: scoreRow } = await anon
      .from('scores')
      .select('current_score, is_provisional, score_status')
      .eq('performance_id', performanceId)
      .single();
    expect(scoreRow?.is_provisional).toBe(true);
    expect(scoreRow?.current_score).not.toBeNull();

    const DURATION_S = 34; // 90% = 30.6s — just above the 30s floor, keeps the wait short.
    await service!.from('performances').update({ duration_s: DURATION_S }).eq('id', performanceId);

    // A short/instant "watch" must NOT unlock voting (Hard Rule 4).
    const start1 = await post('/api/listens/start', { performanceId });
    const { listenId: shortListenId } = (await start1.json()) as { listenId: string };
    const shortComplete = await post('/api/listens/complete', {
      performanceId,
      listenId: shortListenId,
      durationS: DURATION_S,
      events: [
        { kind: 'playing', atSeconds: 0, clientTs: Date.now() },
        { kind: 'ended', atSeconds: DURATION_S, clientTs: Date.now() + 500 },
      ],
    });
    expect((await shortComplete.json()).isValid).toBe(false);

    const earlyVote = await post('/api/votes', {
      performanceId,
      verifiedListenId: shortListenId,
      ratings: FULL_RATINGS,
    });
    expect(earlyVote.status()).toBe(403);

    // A genuine full watch: real wall-clock wait, heartbeat trail consistent
    // with it. This is the actual server anti-cheat under test.
    const start2 = await post('/api/listens/start', { performanceId });
    const { listenId } = (await start2.json()) as { listenId: string };
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 32_000));
    const fullComplete = await post('/api/listens/complete', {
      performanceId,
      listenId,
      durationS: DURATION_S,
      events: heartbeatEvents(t0, 32),
    });
    expect((await fullComplete.json()).isValid).toBe(true);

    const voteRes = await post('/api/votes', {
      performanceId,
      verifiedListenId: listenId,
      ratings: FULL_RATINGS,
    });
    expect(voteRes.status()).toBe(201);
    const voteBody = (await voteRes.json()) as { ok: boolean; verifiedVoteCount: number };
    expect(voteBody.ok).toBe(true);
    expect(voteBody.verifiedVoteCount).toBe(1);
  });

  test('self-vote is forbidden even with a valid Verified Listen', async ({ request }) => {
    const author = await signUpUser();
    const post = authedPost(request, author.token);

    const addRes = await post('/api/performance-requests', {
      youtubeUrl: VIDEO_B,
      category: 'other',
    });
    const { id: performanceId } = (await addRes.json()) as { id: string };

    const DURATION_S = 34;
    await service!.from('performances').update({ duration_s: DURATION_S }).eq('id', performanceId);

    const start = await post('/api/listens/start', { performanceId });
    const { listenId } = (await start.json()) as { listenId: string };
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 32_000));
    const complete = await post('/api/listens/complete', {
      performanceId,
      listenId,
      durationS: DURATION_S,
      events: heartbeatEvents(t0, 32),
    });
    expect((await complete.json()).isValid).toBe(true);

    const voteRes = await post('/api/votes', {
      performanceId,
      verifiedListenId: listenId,
      ratings: FULL_RATINGS,
    });
    expect(voteRes.status()).toBe(403);
    expect((await voteRes.json()).error).toMatch(/own performance/i);
  });

  test('battle vote requires BOTH sides listened; passes once both are verified', async ({
    request,
  }) => {
    const authorA = await signUpUser();
    const authorB = await signUpUser();
    const voter = await signUpUser();

    const addA = await authedPost(request, authorA.token)('/api/performance-requests', {
      youtubeUrl: VIDEO_C,
      category: 'other',
    });
    const { id: perfA } = (await addA.json()) as { id: string };
    const addB = await authedPost(request, authorB.token)('/api/performance-requests', {
      youtubeUrl: VIDEO_D,
      category: 'other',
    });
    const { id: perfB } = (await addB.json()) as { id: string };

    // Isolate this pairing from anything else in the shared local DB (other
    // parallel tests, prior local runs): pin both performances to a fresh,
    // test-only song so /api/battles/next?songId can only return these two.
    const { data: song } = await service!
      .from('songs')
      .insert({
        title: `E2E Battle Song ${randomUUID()}`,
        artist: 'E2E',
        normalized_key: `e2e :: battle ${randomUUID()}`,
      })
      .select('id')
      .single();
    const DURATION_S = 34;
    await service!
      .from('performances')
      .update({ song_id: song!.id, duration_s: DURATION_S })
      .in('id', [perfA, perfB]);

    const post = authedPost(request, voter.token);
    const nextRes = await post('/api/battles/next', { songId: song!.id });
    expect(nextRes.status()).toBe(200);
    const { battleId, a, b } = (await nextRes.json()) as {
      battleId: string;
      a: { performanceId: string };
      b: { performanceId: string };
    };
    expect(new Set([a.performanceId, b.performanceId])).toEqual(new Set([perfA, perfB]));

    // Listen to side A only.
    const startA = await post('/api/listens/start', { performanceId: a.performanceId });
    const { listenId: listenAId } = (await startA.json()) as { listenId: string };
    const tA = Date.now();
    await new Promise((r) => setTimeout(r, 32_000));
    const completeA = await post('/api/listens/complete', {
      performanceId: a.performanceId,
      listenId: listenAId,
      durationS: DURATION_S,
      events: heartbeatEvents(tA, 32),
    });
    expect((await completeA.json()).isValid).toBe(true);

    // Side B has an open-but-unfinished session — one side listened is not enough.
    const startB = await post('/api/listens/start', { performanceId: b.performanceId });
    const { listenId: listenBId } = (await startB.json()) as { listenId: string };

    const earlyBattleVote = await post('/api/battles/vote', {
      battleId,
      winnerPerformanceId: a.performanceId,
      listenAId,
      listenBId,
    });
    expect(earlyBattleVote.status()).toBe(403);

    // Finish side B too.
    const tB = Date.now();
    await new Promise((r) => setTimeout(r, 32_000));
    const completeB = await post('/api/listens/complete', {
      performanceId: b.performanceId,
      listenId: listenBId,
      durationS: DURATION_S,
      events: heartbeatEvents(tB, 32),
    });
    expect((await completeB.json()).isValid).toBe(true);

    const battleVote = await post('/api/battles/vote', {
      battleId,
      winnerPerformanceId: a.performanceId,
      listenAId,
      listenBId,
    });
    expect(battleVote.status()).toBe(201);
  });

  test('account deletion revokes access; the same credentials can no longer sign in', async ({
    request,
  }) => {
    const user = await signUpUser();
    const delRes = await authedPost(request, user.token)('/api/account/delete', {});
    expect(delRes.status()).toBe(200);
    expect((await delRes.json()).ok).toBe(true);

    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });
});

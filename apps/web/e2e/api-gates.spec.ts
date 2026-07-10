import { test, expect } from '@playwright/test';

/**
 * Server-side enforcement of the fairness/anti-cheat Hard Rules, exercised at
 * the real HTTP boundary against the production build.
 *
 * A full happy-path E2E (sign in → Verified Listen → vote → Elo update) needs a
 * seeded Supabase test project with auth, which is not wired into CI. These
 * tests instead pin the enforcement POINTS those flows depend on: every mutating
 * endpoint must reject an unauthenticated caller, and must reject a malformed
 * body BEFORE trusting it. If any of these regress, the vote/battle gates are
 * open regardless of what the UI does.
 *
 * Route contract (verified in the handlers): invalid JSON → 400, Zod-invalid
 * body → 422, missing session → 401 (admin → 403). So a well-formed body with no
 * auth cookie proves the auth gate; a malformed body proves the validation gate.
 */

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_C = '33333333-3333-3333-3333-333333333333';
const UUID_D = '44444444-4444-4444-4444-444444444444';

test.describe('mutating endpoints require a session (unauthenticated)', () => {
  test('vote (Hard Rule 4: no vote without a Verified Listen) → 401', async ({ request }) => {
    const res = await request.post('/api/votes', {
      data: {
        performanceId: UUID_A,
        verifiedListenId: UUID_B,
        ratings: { vocalAccuracy: 80 },
      },
    });
    expect(res.status()).toBe(401);
  });

  test('battle vote (Hard Rule 5: winner needs both sides listened) → 401', async ({ request }) => {
    const res = await request.post('/api/battles/vote', {
      data: {
        battleId: UUID_A,
        winnerPerformanceId: UUID_B,
        listenAId: UUID_C,
        listenBId: UUID_D,
      },
    });
    expect(res.status()).toBe(401);
  });

  test('listen complete (Verified Listen is server-recorded) → 401', async ({ request }) => {
    const res = await request.post('/api/listens/complete', {
      data: {
        performanceId: UUID_A,
        listenId: UUID_B,
        durationS: 240,
        events: [{ kind: 'ended', atSeconds: 240, clientTs: 1 }],
      },
    });
    expect(res.status()).toBe(401);
  });

  test('comment → 401', async ({ request }) => {
    const res = await request.post('/api/comments', {
      data: { performanceId: UUID_A, body: 'nice run' },
    });
    expect(res.status()).toBe(401);
  });

  test('report → 401', async ({ request }) => {
    const res = await request.post('/api/report', {
      data: { targetType: 'performance', targetId: UUID_A, reason: 'spam content' },
    });
    expect(res.status()).toBe(401);
  });

  test('admin moderation is closed to anonymous callers → 403', async ({ request }) => {
    const res = await request.post('/api/admin/moderate', {
      data: { flagId: UUID_A, status: 'resolved' },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('malformed bodies are rejected before any trust', () => {
  test('vote with no ratings → 422', async ({ request }) => {
    const res = await request.post('/api/votes', {
      data: { performanceId: UUID_A, verifiedListenId: UUID_B, ratings: {} },
    });
    expect(res.status()).toBe(422);
  });

  test('battle vote with non-UUID ids → 422', async ({ request }) => {
    const res = await request.post('/api/battles/vote', {
      data: { battleId: 'nope', winnerPerformanceId: 'x', listenAId: 'y', listenBId: 'z' },
    });
    expect(res.status()).toBe(422);
  });

  test('non-JSON body → 400', async ({ request }) => {
    // Send raw, genuinely-broken bytes: a string `data` would be JSON-encoded by
    // the client (and then parse fine). A Buffer is sent verbatim, so req.json()
    // throws and the handler returns 400 before any validation or trust.
    const res = await request.post('/api/comments', {
      headers: { 'content-type': 'application/json' },
      data: Buffer.from('{ broken json'),
    });
    expect(res.status()).toBe(400);
  });
});

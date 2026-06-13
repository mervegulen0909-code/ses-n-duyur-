import type { BattleVoteInput, ListenEvent } from '@vocal-league/core';

import { supabase } from './supabase';

// The native app talks to the deployed Next.js API (same fairness/score logic
// as web). Override with EXPO_PUBLIC_API_BASE_URL for local/staging.
//
// AUTH: mobile sends the Supabase access token as a Bearer header. The API's
// getRequestContext (apps/web/src/lib/supabase/server.ts) accepts BOTH cookie
// (web) and Bearer (mobile) auth, so these calls authenticate from native. The
// only caveat is deploy lag: until this branch ships to the API_BASE host, calls
// hit the older cookie-only build and 401. /api/votes ADDITIONALLY needs a
// bot-check token (Turnstile on web; App Attest / Play Integrity on native, N2b)
// which is not wired here yet, so /api/votes stays gated until that lands.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://ses-n-duyur-web.vercel.app';

async function authedPost<T>(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data: json };
}

export async function startListen(performanceId: string): Promise<string | null> {
  const { data } = await authedPost<{ listenId?: string }>('/api/listens/start', { performanceId });
  return data.listenId ?? null;
}

export async function completeListen(
  performanceId: string,
  listenId: string,
  durationS: number,
  events: ListenEvent[],
): Promise<{ isValid: boolean; reason?: string | null }> {
  const { data } = await authedPost<{ isValid?: boolean; reason?: string | null }>(
    '/api/listens/complete',
    { performanceId, listenId, durationS, events },
  );
  return { isValid: data.isValid === true, reason: data.reason ?? null };
}

export async function submitVote(
  performanceId: string,
  verifiedListenId: string,
  ratings: Record<string, number>,
): Promise<{ ok: boolean; status: number; currentScore?: number; error?: string }> {
  const { ok, status, data } = await authedPost<{
    ok?: boolean;
    currentScore?: number;
    error?: string;
  }>('/api/votes', { performanceId, verifiedListenId, ratings });
  return {
    ok: ok && data.ok !== false,
    status,
    currentScore: data.currentScore,
    error: data.error,
  };
}

/** One side of a battle pairing as returned by /api/battles/next. */
export type BattleSidePayload = {
  performanceId: string;
  videoId: string | null;
  title: string;
};

/** The /api/battles/next response (server creates the pairing via service role). */
export type NextBattlePayload = {
  battleId: string;
  a: BattleSidePayload;
  b: BattleSidePayload;
  error?: string;
};

/**
 * Fetch (and create) one open battle pairing. The `battles` table is
 * admin/service-role insert-only under RLS, so the client cannot pair directly
 * via supabase — this server route does it. Authenticates via getRequestContext
 * (cookie or Bearer), so it succeeds from native once this branch is deployed.
 * 404 = not enough performances to pair.
 */
export async function nextBattle(): Promise<{
  ok: boolean;
  status: number;
  data: NextBattlePayload | null;
}> {
  const { ok, status, data } = await authedPost<NextBattlePayload>('/api/battles/next', {});
  return { ok, status, data: (data ?? null) as NextBattlePayload | null };
}

/**
 * Pick a battle winner. Body matches battleVoteSchema. The server re-verifies
 * BOTH listens (valid, owned by this user, covering each side) before counting
 * the vote. /api/battles/vote uses only rateLimit (no botGuard), so there is no
 * device-attestation gate here — getRequestContext honors the Bearer header, so
 * this succeeds from native once this branch is deployed. A 403 means both sides
 * were not validly listened.
 */
export async function submitBattleVote(
  input: BattleVoteInput,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const { ok, status, data } = await authedPost<{ ok?: boolean; error?: string }>(
    '/api/battles/vote',
    input,
  );
  return { ok: ok && data.ok !== false, status, error: data.error };
}

/**
 * Permanently delete the signed-in user's account and all their data. Required
 * by Apple Guideline 5.1.1(v) and Google Play for any app with account creation.
 * The server deletes ONLY the JWT's user (no id in the body) and cascades all
 * owned rows. Cookie/Bearer-auth via getRequestContext — succeeds from mobile
 * once this branch is deployed to the API_BASE host (401 until then).
 */
export async function deleteAccount(): Promise<{ ok: boolean; status: number; error?: string }> {
  const { ok, status, data } = await authedPost<{ ok?: boolean; error?: string }>(
    '/api/account/delete',
    {},
  );
  return { ok: ok && data.ok !== false, status, error: data.error };
}

export type PostedComment = { id: string; body: string; created_at: string };

/**
 * Post a comment on a performance. The server route uses rateLimit only (no
 * botGuard), so this works from native once this branch is deployed (401 until
 * then). The author is the verified JWT user, never a body-supplied id.
 */
export async function postComment(
  performanceId: string,
  body: string,
): Promise<{ ok: boolean; status: number; comment?: PostedComment; error?: string }> {
  const { ok, status, data } = await authedPost<{
    ok?: boolean;
    comment?: PostedComment;
    error?: string;
  }>('/api/comments', { performanceId, body });
  return { ok: ok && data.ok !== false, status, comment: data.comment, error: data.error };
}

/**
 * Submit a new performance from a YouTube URL. The server fetches oEmbed
 * metadata, runs the provisional AI score, and inserts it (returns the new id).
 *
 * GATING: /api/performances uses botGuard, so — like single-vote — this is gated
 * on web Turnstile / native attestation (N2b): it 403s from native in prod until
 * that lands, and 401s until this branch is deployed. It works in dev (Noop
 * bot-check), so the screen is fully usable for local/preview QA.
 */
export async function addPerformance(
  youtubeUrl: string,
): Promise<{ ok: boolean; status: number; id?: string; error?: string }> {
  const { ok, status, data } = await authedPost<{ id?: string; error?: string }>(
    '/api/performances',
    { youtubeUrl },
  );
  return { ok: ok && !!data.id, status, id: data.id, error: data.error };
}

/**
 * Persist this device's Expo push token so the server can send remote pushes.
 * Upserts on (user, token) server-side, so calling it on every registration is
 * idempotent. rateLimit-only route (no botGuard) → works from native once this
 * branch is deployed (401 until then). Body matches pushRegisterSchema.
 */
export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<{ ok: boolean; status: number }> {
  const { ok, status, data } = await authedPost<{ ok?: boolean }>('/api/push/register', {
    token,
    platform,
  });
  return { ok: ok && data.ok !== false, status };
}

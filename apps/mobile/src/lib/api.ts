import type { BattleVoteInput, ListenEvent, SongCategory } from '@voxscore/core';

import { WEB_BASE as API_BASE } from './config';
import { supabase } from './supabase';
import { getNativeIntegrityHeaders } from './attestation';

export const NATIVE_CLIENT_HEADERS = {
  'x-voxscore-client': 'mobile-app',
} as const;

const ATTESTED_PATHS = new Set([
  '/api/votes',
  '/api/battles/vote',
  '/api/performance-requests',
  '/api/leagues',
  '/api/leagues/join',
]);

// The native app talks to the deployed Next.js API (same fairness/score logic
// as web). Base URL is single-sourced in lib/config.ts (override per env with
// EXPO_PUBLIC_API_BASE_URL for local/staging).
//
// AUTH: mobile sends the Supabase access token as a Bearer header. The API's
// getRequestContext (apps/web/src/lib/supabase/server.ts) accepts BOTH cookie
// (web) and Bearer (mobile) auth. A 401 from these routes means the session is
// missing/expired, not a missing backend.
//
// BOT GUARD: browser clients use Turnstile. Native clients identify themselves
// with NATIVE_CLIENT_HEADERS; the server only requires Play Integrity / App
// Attest when NATIVE_ATTESTATION_REQUIRED=true. When native attestation is
// enabled for a build, authedPost attaches integrity headers for ATTESTED_PATHS.

/**
 * Return a NON-expired access token for a Bearer header, refreshing first when
 * the stored session's token is at/near expiry. `getSession()` alone returns the
 * cached token WITHOUT refreshing, so a long-open app sends an expired token and
 * every authed write 401s ("session expired") even though the user is signed in.
 */
async function freshAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return undefined;
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? session.access_token;
  }
  return session.access_token;
}

async function authedPost<T>(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const token = await freshAccessToken();
  const rawBody = JSON.stringify(body);
  try {
    const pathname = path.split('?')[0] ?? path;
    const integrityHeaders =
      process.env.EXPO_PUBLIC_NATIVE_ATTESTATION_ENABLED === 'true' && ATTESTED_PATHS.has(pathname)
        ? await getNativeIntegrityHeaders(path, 'POST', rawBody)
        : {};
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...NATIVE_CLIENT_HEADERS,
        ...integrityHeaders,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: rawBody,
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data: json };
  } catch (error) {
    // Network failure (offline, DNS, TLS, timeout) REJECTS fetch on-device.
    // Surface a synthetic failure so every caller's `if (!res.ok)` / error
    // branch fires instead of the promise rejecting and freezing the screen.
    return {
      ok: false,
      status: 0,
      data: {
        error: error instanceof Error ? error.message : 'Network or app integrity error',
      } as T,
    };
  }
}

async function authedGet<T>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const token = await freshAccessToken();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: {
        ...NATIVE_CLIENT_HEADERS,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data: json };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export async function startListen(
  performanceId: string,
): Promise<{ listenId: string | null; status: number; error?: string }> {
  const { status, data } = await authedPost<{ listenId?: string; error?: string }>(
    '/api/listens/start',
    { performanceId },
  );
  return { listenId: data.listenId ?? null, status, error: data.error };
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

export interface AnalysisSessionUpload {
  sessionId: string;
  uploadUrl: string;
  uploadToken: string;
  expiresAt: string;
  maxBytes: number;
}

export async function createAnalysisSession(performanceId: string): Promise<{
  ok: boolean;
  status: number;
  session?: AnalysisSessionUpload;
  error?: string;
}> {
  const { ok, status, data } = await authedPost<AnalysisSessionUpload & { error?: string }>(
    '/api/analysis/sessions',
    { performanceId, mode: 'song_reference' },
  );
  return {
    ok,
    status,
    session: ok ? data : undefined,
    error: data.error,
  };
}

export interface AnalysisSessionState {
  id: string;
  performance_id: string;
  status: 'created' | 'uploading' | 'processing' | 'completed' | 'rejected' | 'failed' | 'expired';
  error_code: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function getAnalysisSession(sessionId: string): Promise<{
  ok: boolean;
  status: number;
  session?: AnalysisSessionState;
}> {
  const { ok, status, data } = await authedGet<{ session?: AnalysisSessionState }>(
    `/api/analysis/sessions/${encodeURIComponent(sessionId)}`,
  );
  return { ok, status, session: data.session };
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
 * (cookie or Bearer), so it succeeds from native (Bearer-auth is live in prod).
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
 * the vote. The route also runs botGuard: web clients must pass Turnstile, while
 * native clients pass via NATIVE_CLIENT_HEADERS and only need device attestation
 * when the server requires it. A 403 can mean bot/device protection failed or
 * one/both sides were not validly listened.
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
 * Best-effort: tell the server a performance's video would not embed/play in app
 * (so an in-app Verified Listen is impossible). The server re-verifies with the
 * YouTube Data API before excluding it from future battles, so this is advisory.
 * Fire-and-forget — the user already sees the block, and a failure is harmless.
 */
export async function reportUnplayable(performanceId: string): Promise<void> {
  await authedPost('/api/performances/report-unplayable', { performanceId });
}

/**
 * Permanently delete the signed-in user's account and all their data. Required
 * by Apple Guideline 5.1.1(v) and Google Play for any app with account creation.
 * The server deletes ONLY the JWT's user (no id in the body) and cascades all
 * owned rows. Cookie/Bearer-auth via getRequestContext — works from mobile
 * (Bearer-auth is live; a 401 means the session expired).
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
 * botGuard), so this works from native today (Bearer-auth is live). The author
 * is the verified JWT user, never a body-supplied id.
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
 * Submit a YouTube URL for immediate server-side validation and scoring.
 * The endpoint creates an active performance when the video passes checks and
 * keeps an approved request row only as history/audit.
 */
export async function submitPerformanceRequest(
  youtubeUrl: string,
  category: SongCategory,
  note?: string,
): Promise<{ ok: boolean; status: number; id?: string; error?: string }> {
  const { ok, status, data } = await authedPost<{ id?: string; error?: string }>(
    '/api/performance-requests',
    { youtubeUrl, category, note },
  );
  return { ok: ok && !!data.id, status, id: data.id, error: data.error };
}

export interface PerformanceRequestRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  category: SongCategory;
  youtube_url: string;
  rejection_reason: string | null;
  created_at: string;
}

/** The signed-in user's own request history, newest first. */
export async function myPerformanceRequests(): Promise<{
  ok: boolean;
  status: number;
  requests: PerformanceRequestRow[];
}> {
  const { ok, status, data } = await authedGet<{ requests?: PerformanceRequestRow[] }>(
    '/api/performance-requests',
  );
  return { ok, status, requests: data.requests ?? [] };
}

/**
 * Persist this device's Expo push token so the server can send remote pushes.
 * Upserts on (user, token) server-side, so calling it on every registration is
 * idempotent. rateLimit-only route (no botGuard) → works from native today
 * (Bearer-auth is live). Body matches pushRegisterSchema.
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

export interface CustomLeagueSummary {
  id: string;
  name: string;
  isOwner: boolean;
}

export interface CustomLeagueDetail {
  league: { id: string; name: string; joinCode: string };
  members: Array<{
    id: string;
    handle: string;
    wins: number;
    predictionPoints: number;
    isMe: boolean;
  }>;
}

export async function myCustomLeagues(): Promise<{
  ok: boolean;
  status: number;
  leagues: CustomLeagueSummary[];
  error?: string;
}> {
  const { ok, status, data } = await authedGet<{
    leagues?: CustomLeagueSummary[];
    error?: string;
  }>('/api/leagues');
  return { ok, status, leagues: data.leagues ?? [], error: data.error };
}

export async function createCustomLeague(name: string): Promise<{
  ok: boolean;
  status: number;
  id?: string;
  error?: string;
}> {
  const { ok, status, data } = await authedPost<{ id?: string; error?: string }>('/api/leagues', {
    name,
  });
  return { ok: ok && !!data.id, status, id: data.id, error: data.error };
}

export async function joinCustomLeague(code: string): Promise<{
  ok: boolean;
  status: number;
  leagueId?: string;
  error?: string;
}> {
  const { ok, status, data } = await authedPost<{ leagueId?: string; error?: string }>(
    '/api/leagues/join',
    { code },
  );
  return { ok: ok && !!data.leagueId, status, leagueId: data.leagueId, error: data.error };
}

export async function customLeagueDetail(id: string): Promise<{
  ok: boolean;
  status: number;
  detail?: CustomLeagueDetail;
  error?: string;
}> {
  const { ok, status, data } = await authedGet<CustomLeagueDetail & { error?: string }>(
    `/api/leagues/${encodeURIComponent(id)}`,
  );
  return { ok, status, detail: ok ? data : undefined, error: data.error };
}

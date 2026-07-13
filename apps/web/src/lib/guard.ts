import { getRateLimiter } from './adapters/ratelimit';
import { getBotCheck } from './adapters/botcheck';
import { verifyNativeRequest } from './native-attestation';

// Module-level singletons (per route module). These resolve to the real
// Upstash/Turnstile adapters when their env keys are set, else dev mocks.
const writeLimiter = getRateLimiter(20, 60_000); // 20 writes / minute / key
// Analytics events fire far more often than league writes (every page view,
// every share click) — a separate, more permissive limiter so normal usage
// never trips the write limiter's 20/min budget.
const analyticsLimiter = getRateLimiter(120, 60_000); // 120 events / minute / key
const botCheck = getBotCheck();
const NATIVE_CLIENT_HEADER = 'x-voxscore-client';
const NATIVE_CLIENT_VALUE = 'mobile-app';

function keyFor(req: Request, userId?: string): string {
  if (userId) return `u:${userId}`;
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return `ip:${fwd.split(',')[0]?.trim() || 'unknown'}`;
}

function hasBearerAuth(req: Request): boolean {
  return /^Bearer\s+\S+/i.test(req.headers.get('authorization') ?? '');
}

export function isNativeClientRequest(req: Request): boolean {
  return req.headers.get(NATIVE_CLIENT_HEADER) === NATIVE_CLIENT_VALUE && hasBearerAuth(req);
}

/** Rate-limit a mutating request. Returns a 429 Response when over the limit. */
export async function rateLimit(req: Request, userId?: string): Promise<Response | null> {
  const { success } = await writeLimiter.check(keyFor(req, userId));
  if (!success) {
    return Response.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  return null;
}

/** Rate-limit an analytics event, keyed by session (falls back to IP). */
export async function analyticsRateLimit(
  req: Request,
  sessionId: string,
): Promise<Response | null> {
  const { success } = await analyticsLimiter.check(keyFor(req, sessionId));
  if (!success) {
    return Response.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  return null;
}

/**
 * Verify a bot-check (Turnstile) token from the `x-turnstile-token` header.
 * In dev the Noop check passes; Faz J enforces real Turnstile.
 */
export async function botGuard(
  req: Request,
  userId?: string,
  rawBody?: string | Uint8Array,
): Promise<Response | null> {
  if (isNativeClientRequest(req)) {
    // Local development can use Expo Go/simulators. Production is always
    // fail-closed; the explicit env also enables real attestation in staging.
    const required =
      process.env.NODE_ENV === 'production' || process.env.NATIVE_ATTESTATION_REQUIRED === 'true';
    if (!required) return null;
    if (!userId || !(await verifyNativeRequest(req, userId, rawBody))) {
      return Response.json({ error: 'Native app integrity check failed.' }, { status: 403 });
    }
    return null;
  }
  const ok = await botCheck.verify(req.headers.get('x-turnstile-token'));
  if (!ok) return Response.json({ error: 'Bot check failed.' }, { status: 403 });
  return null;
}

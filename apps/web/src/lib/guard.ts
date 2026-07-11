import { getRateLimiter } from './adapters/ratelimit';
import { getBotCheck } from './adapters/botcheck';

// Module-level singletons (per route module). These resolve to the real
// Upstash/Turnstile adapters when their env keys are set, else dev mocks.
const writeLimiter = getRateLimiter(20, 60_000); // 20 writes / minute / key
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

/**
 * Verify a bot-check (Turnstile) token from the `x-turnstile-token` header.
 * In dev the Noop check passes; Faz J enforces real Turnstile.
 */
export async function botGuard(req: Request): Promise<Response | null> {
  if (isNativeClientRequest(req)) return null;
  const ok = await botCheck.verify(req.headers.get('x-turnstile-token'));
  if (!ok) return Response.json({ error: 'Bot check failed.' }, { status: 403 });
  return null;
}

import { createHash } from 'node:crypto';

/**
 * Salted one-way network hash for vote-burst (brigade) detection — A3.
 * We store sha256(salt + ip), NEVER the raw IP: with the server-side salt
 * secret, the hash cannot be reversed or joined against rainbow tables,
 * which is what lets /privacy keep its "no invasive fingerprinting" promise.
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}${ip}`).digest('hex');
}

/** First `x-forwarded-for` hop — the client, per Vercel's proxy contract. */
export function clientIpFrom(req: Request): string | null {
  const header = req.headers.get('x-forwarded-for');
  const first = header?.split(',')[0]?.trim();
  return first || null;
}

/**
 * The value listens/start stores. Null (column stays null, row still written)
 * when the forwarded header OR the salt is missing — an unsalted hash would
 * be trivially reversible, so we would rather store nothing.
 */
export function ipHashFromRequest(req: Request): string | null {
  const salt = process.env.ANTI_ABUSE_SALT;
  const ip = clientIpFrom(req);
  if (!salt || !ip) return null;
  return hashIp(ip, salt);
}

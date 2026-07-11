/**
 * Referral helpers. A referral link is just the site URL with `?ref=<inviter
 * user id>`; the login page persists the param in a short-lived cookie so it
 * survives the Google OAuth redirect, and the auth callback attributes the
 * conversion server-side (analytics `invite_converted` + the inviter badge).
 */

export const REF_COOKIE = 'vs_ref';
/** Cookie lifetime: long enough to finish an OAuth round-trip, no longer. */
export const REF_COOKIE_MAX_AGE_S = 30 * 60;
/** A signup this soon after account creation counts as a NEW user. */
export const NEW_USER_WINDOW_MS = 10 * 60 * 1000;
/** The inviter badge unlocks at this many converted invites. */
export const INVITER_BADGE_THRESHOLD = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Referral codes are inviter user ids — anything else is ignored, not trusted. */
export function isValidRefCode(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/** The invite link for a signed-in user; signed-out visitors share the plain URL. */
export function inviteUrl(siteUrl: string, userId: string | null | undefined): string {
  return isValidRefCode(userId) ? `${siteUrl}/?ref=${userId}` : siteUrl;
}

/** Read one cookie out of a raw `Cookie` request header (no parsing library). */
export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=')) || null;
  }
  return null;
}

/** True when the authenticated user was created within the new-user window. */
export function isNewUser(createdAt: string | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const age = now.getTime() - created;
  return age >= 0 && age <= NEW_USER_WINDOW_MS;
}

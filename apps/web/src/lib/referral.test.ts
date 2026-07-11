import { describe, expect, it } from 'vitest';
import { cookieValue, inviteUrl, isNewUser, isValidRefCode, REF_COOKIE } from './referral';

const UID = '11111111-2222-3333-4444-555555555555';

describe('isValidRefCode — ref codes are inviter user ids, nothing else', () => {
  it('accepts a uuid', () => {
    expect(isValidRefCode(UID)).toBe(true);
  });
  it('rejects junk, empty, and injection-shaped values', () => {
    for (const bad of [null, undefined, '', 'admin', '1 OR 1=1', `${UID}x`, 'user_973d893f']) {
      expect(isValidRefCode(bad)).toBe(false);
    }
  });
});

describe('inviteUrl', () => {
  it('appends ?ref= for a signed-in user', () => {
    expect(inviteUrl('https://voxscore.app', UID)).toBe(`https://voxscore.app/?ref=${UID}`);
  });
  it('falls back to the plain site URL when signed out or invalid', () => {
    expect(inviteUrl('https://voxscore.app', null)).toBe('https://voxscore.app');
    expect(inviteUrl('https://voxscore.app', 'nope')).toBe('https://voxscore.app');
  });
});

describe('cookieValue', () => {
  it('finds the ref cookie among others', () => {
    expect(cookieValue(`a=1; ${REF_COOKIE}=${UID}; b=2`, REF_COOKIE)).toBe(UID);
  });
  it('returns null for a missing header or cookie', () => {
    expect(cookieValue(null, REF_COOKIE)).toBeNull();
    expect(cookieValue('a=1', REF_COOKIE)).toBeNull();
  });
});

describe('isNewUser', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  it('true within the window', () => {
    expect(isNewUser('2026-07-11T11:55:00Z', now)).toBe(true);
  });
  it('false for an account older than the window (returning login)', () => {
    expect(isNewUser('2026-07-01T11:00:00Z', now)).toBe(false);
  });
  it('false for missing or garbage timestamps', () => {
    expect(isNewUser(undefined, now)).toBe(false);
    expect(isNewUser('not-a-date', now)).toBe(false);
  });
});

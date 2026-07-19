import { describe, expect, it } from 'vitest';
import {
  validateListen,
  MIN_VERIFIED_LISTEN_WATCHED_PCT,
  MAX_VERIFIED_LISTEN_SECONDS,
  VERIFIED_LISTEN_CLIENT_SUBMIT_PCT,
  requiredVerifiedListenSeconds,
  verifiedListenClientSubmitSeconds,
} from './listen';
import type { ListenEvent } from './schemas';

function play(atSeconds: number, clientTs: number): ListenEvent {
  return { kind: 'playing', atSeconds, clientTs };
}

describe('validateListen', () => {
  it('keeps the client submit trigger safely above the server acceptance gate', () => {
    expect(VERIFIED_LISTEN_CLIENT_SUBMIT_PCT).toBeGreaterThan(MIN_VERIFIED_LISTEN_WATCHED_PCT);
    expect(VERIFIED_LISTEN_CLIENT_SUBMIT_PCT).toBeLessThanOrEqual(1);
  });

  it('accepts an honest, near-complete watch', () => {
    // 100s video, heartbeats every 10s tracking real time.
    const events: ListenEvent[] = [];
    for (let s = 0; s <= 100; s += 10) events.push(play(s, s * 1000));
    const r = validateListen(events, 100);
    expect(r.isValid).toBe(true);
    expect(r.watchedPct).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects an instant scrub to the end', () => {
    const events: ListenEvent[] = [play(0, 0), { kind: 'ended', atSeconds: 100, clientTs: 500 }];
    const r = validateListen(events, 100);
    expect(r.isValid).toBe(false);
    expect(r.watchedPct).toBeLessThan(0.1);
    expect(r.reason).toMatch(/watched/);
  });

  it('rejects a partial watch below threshold', () => {
    const events: ListenEvent[] = [];
    for (let s = 0; s <= 50; s += 10) events.push(play(s, s * 1000));
    expect(validateListen(events, 100).isValid).toBe(false);
  });

  it('still validates a full watch that included a pause', () => {
    const events: ListenEvent[] = [
      play(0, 0),
      play(30, 30_000),
      { kind: 'paused', atSeconds: 30, clientTs: 35_000 },
      play(30, 60_000),
      play(100, 130_000),
    ];
    const r = validateListen(events, 100);
    expect(r.isValid).toBe(true);
  });

  it('honors a custom (lower) threshold', () => {
    const events: ListenEvent[] = [];
    for (let s = 0; s <= 50; s += 10) events.push(play(s, s * 1000));
    expect(validateListen(events, 100, { minWatchedPct: 0.5 }).isValid).toBe(true);
  });

  it('rejects invalid duration and empty events', () => {
    expect(validateListen([play(0, 0)], 0).isValid).toBe(false);
    expect(validateListen([], 100).reason).toBe('no events');
  });

  describe(`full-listen gate (${MIN_VERIFIED_LISTEN_WATCHED_PCT * 100}% of trusted length)`, () => {
    const opts = { minWatchedPct: MIN_VERIFIED_LISTEN_WATCHED_PCT, minWatchSeconds: 30 };

    it('rejects an 89% watch just under the threshold', () => {
      // 200s video, honest heartbeats up to 178s (89%).
      const events: ListenEvent[] = [];
      for (let s = 0; s <= 178; s += 2) events.push(play(s, s * 1000));
      const r = validateListen(events, 200, { ...opts, serverElapsedS: 185 });
      expect(r.isValid).toBe(false);
      expect(r.watchedPct).toBeCloseTo(0.89, 2);
      expect(r.reason).toMatch(/89% < required 90%/);
    });

    it('accepts a 90% watch at the threshold', () => {
      const events: ListenEvent[] = [];
      for (let s = 0; s <= 180; s += 2) events.push(play(s, s * 1000));
      const r = validateListen(events, 200, { ...opts, serverElapsedS: 185 });
      expect(r.isValid).toBe(true);
      expect(r.watchedPct).toBeGreaterThanOrEqual(MIN_VERIFIED_LISTEN_WATCHED_PCT);
    });

    it('rejects a short clip whose 90% falls under the 30s floor even when fully watched', () => {
      // 20s clip watched end-to-end: 100% covered, but only 20s < 30s floor.
      const events: ListenEvent[] = [];
      for (let s = 0; s <= 20; s += 1) events.push(play(s, s * 1000));
      const r = validateListen(events, 20, { ...opts, serverElapsedS: 25 });
      expect(r.isValid).toBe(false);
      expect(r.reason).toMatch(/insufficient playback/);
    });
  });

  describe('MAX_VERIFIED_LISTEN_SECONDS cap on long performances', () => {
    it('does not lower the requirement for a 200s video (90% already under the cap)', () => {
      expect(requiredVerifiedListenSeconds(200)).toBe(180);
    });

    it('caps a 600s video at 180s instead of the flat 90% (540s)', () => {
      expect(requiredVerifiedListenSeconds(600)).toBe(MAX_VERIFIED_LISTEN_SECONDS);
    });

    it('accepts exactly the capped 180s watch of a 600s video', () => {
      const events: ListenEvent[] = [];
      for (let s = 0; s <= 180; s += 2) events.push(play(s, s * 1000));
      const effectiveMinWatchedPct = requiredVerifiedListenSeconds(600) / 600;
      const r = validateListen(events, 600, {
        minWatchedPct: effectiveMinWatchedPct,
        minWatchSeconds: 30,
        serverElapsedS: 185,
      });
      expect(r.isValid).toBe(true);
    });

    it('rejects a 170s watch of a 600s video, just under the capped threshold', () => {
      const events: ListenEvent[] = [];
      for (let s = 0; s <= 170; s += 2) events.push(play(s, s * 1000));
      const effectiveMinWatchedPct = requiredVerifiedListenSeconds(600) / 600;
      const r = validateListen(events, 600, {
        minWatchedPct: effectiveMinWatchedPct,
        minWatchSeconds: 30,
        serverElapsedS: 175,
      });
      expect(r.isValid).toBe(false);
    });

    it('keeps the client submit trigger above the capped server requirement', () => {
      expect(verifiedListenClientSubmitSeconds(600)).toBeGreaterThan(
        requiredVerifiedListenSeconds(600),
      );
      // ...and still below the full duration, so a capped long video doesn't
      // force the client to wait for a near-complete watch.
      expect(verifiedListenClientSubmitSeconds(600)).toBeLessThan(600);
    });
  });

  describe('server anchors (unforgeable)', () => {
    it('rejects a forged full-coverage trail that exceeds real elapsed time', () => {
      // Attacker fabricates a self-consistent trail: 200s of "playback" with
      // matching client timestamps, claiming 100% — but only 3s actually elapsed
      // server-side. The wall-clock anchor rejects it.
      const events: ListenEvent[] = [play(0, 0), play(200, 200_000)];
      const r = validateListen(events, 200, { serverElapsedS: 3, minWatchSeconds: 15 });
      expect(r.isValid).toBe(false);
      expect(r.reason).toMatch(/exceeds real elapsed time/);
    });

    it('rejects the tiny-duration trick via the absolute floor', () => {
      // Claim 100% of a 1-second "video" — internally consistent, but covers far
      // too few seconds to be a genuine listen.
      const events: ListenEvent[] = [play(0, 0), play(1, 1_000)];
      const r = validateListen(events, 1, { serverElapsedS: 2, minWatchSeconds: 15 });
      expect(r.isValid).toBe(false);
      expect(r.reason).toMatch(/insufficient playback/);
    });

    it('accepts an honest watch consistent with real elapsed time', () => {
      const events: ListenEvent[] = [];
      for (let s = 0; s <= 100; s += 10) events.push(play(s, s * 1000));
      const r = validateListen(events, 100, { serverElapsedS: 105, minWatchSeconds: 15 });
      expect(r.isValid).toBe(true);
    });
  });
});

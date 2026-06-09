import { describe, expect, it } from 'vitest';
import { validateListen } from './listen';
import type { ListenEvent } from './schemas';

function play(atSeconds: number, clientTs: number): ListenEvent {
  return { kind: 'playing', atSeconds, clientTs };
}

describe('validateListen', () => {
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
});

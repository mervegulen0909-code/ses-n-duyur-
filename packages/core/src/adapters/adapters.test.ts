import { describe, expect, it } from 'vitest';
import { CRITERIA } from '@vocal-league/scoring';
import {
  InMemoryRateLimiter,
  MockScoringProvider,
  NoopBotCheck,
  createBotCheck,
  createRateLimiter,
  createScoringProvider,
} from './index';

describe('MockScoringProvider', () => {
  const provider = new MockScoringProvider();
  const input = {
    videoId: 'dQw4w9WgXcQ',
    title: 'My Cover',
    authorName: 'Singer',
    hasVideo: true,
  };

  it('is deterministic for the same input', async () => {
    const a = await provider.score(input);
    const b = await provider.score(input);
    expect(a.initialAiScore).toBe(b.initialAiScore);
  });

  it('always flags the score as provisional', async () => {
    const r = await provider.score(input);
    expect(r.provisional).toBe(true);
    expect(r.model).toMatch(/provisional/);
  });

  it('returns all 9 criteria within [0, 100] and a valid composite', async () => {
    const r = await provider.score(input);
    expect(Object.keys(r.breakdown)).toHaveLength(CRITERIA.length);
    for (const c of CRITERIA) {
      expect(r.breakdown[c]).toBeGreaterThanOrEqual(0);
      expect(r.breakdown[c]).toBeLessThanOrEqual(100);
    }
    expect(r.initialAiScore).toBeGreaterThanOrEqual(0);
    expect(r.initialAiScore).toBeLessThanOrEqual(100);
  });

  it('handles the no-video rescale path', async () => {
    const r = await provider.score({ ...input, hasVideo: false });
    expect(r.initialAiScore).toBeGreaterThanOrEqual(0);
    expect(r.initialAiScore).toBeLessThanOrEqual(100);
  });
});

describe('InMemoryRateLimiter', () => {
  it('allows up to the limit then blocks', async () => {
    const t = 1000;
    const rl = new InMemoryRateLimiter(2, 1000, () => t);
    expect((await rl.check('k')).success).toBe(true);
    expect((await rl.check('k')).success).toBe(true);
    const blocked = await rl.check('k');
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets after the window elapses', async () => {
    let t = 1000;
    const rl = new InMemoryRateLimiter(1, 1000, () => t);
    expect((await rl.check('k')).success).toBe(true);
    expect((await rl.check('k')).success).toBe(false);
    t = 2000;
    expect((await rl.check('k')).success).toBe(true);
  });

  it('uses the real clock by default', async () => {
    const rl = new InMemoryRateLimiter(1, 1000);
    expect((await rl.check('x')).success).toBe(true);
  });

  it('validates its constructor args', () => {
    expect(() => new InMemoryRateLimiter(0, 1000)).toThrow(RangeError);
    expect(() => new InMemoryRateLimiter(1, 0)).toThrow(RangeError);
  });
});

describe('NoopBotCheck', () => {
  it('passes for any token', async () => {
    const bot = new NoopBotCheck();
    expect(await bot.verify('token')).toBe(true);
    expect(await bot.verify(null)).toBe(true);
  });
});

describe('factories', () => {
  it('return development mocks', async () => {
    expect(createScoringProvider()).toBeInstanceOf(MockScoringProvider);
    expect(createRateLimiter()).toBeInstanceOf(InMemoryRateLimiter);
    expect(createRateLimiter(10, 5000)).toBeInstanceOf(InMemoryRateLimiter);
    expect(createBotCheck()).toBeInstanceOf(NoopBotCheck);
  });
});

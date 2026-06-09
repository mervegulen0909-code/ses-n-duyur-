import { describe, expect, it } from 'vitest';
import {
  addPerformanceSchema,
  battleVoteSchema,
  listenCompleteSchema,
  listenEventSchema,
  voteSchema,
} from './schemas';

const UUID = '11111111-1111-1111-1111-111111111111';
const UUID2 = '22222222-2222-2222-2222-222222222222';

describe('addPerformanceSchema', () => {
  it('accepts a valid YouTube URL', () => {
    const r = addPerformanceSchema.safeParse({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(r.success).toBe(true);
  });
  it('rejects a non-YouTube URL', () => {
    const r = addPerformanceSchema.safeParse({ youtubeUrl: 'https://example.com/x' });
    expect(r.success).toBe(false);
  });
  it('rejects a bad optional songId', () => {
    const r = addPerformanceSchema.safeParse({
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      songId: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });
});

describe('voteSchema', () => {
  it('accepts a vote with at least one rating + verified listen', () => {
    const r = voteSchema.safeParse({
      performanceId: UUID,
      verifiedListenId: UUID2,
      ratings: { vocalAccuracy: 80, emotionInterpretation: 70 },
    });
    expect(r.success).toBe(true);
  });
  it('rejects an empty ratings object', () => {
    const r = voteSchema.safeParse({
      performanceId: UUID,
      verifiedListenId: UUID2,
      ratings: {},
    });
    expect(r.success).toBe(false);
  });
  it('rejects an out-of-range rating', () => {
    const r = voteSchema.safeParse({
      performanceId: UUID,
      verifiedListenId: UUID2,
      ratings: { vocalAccuracy: 120 },
    });
    expect(r.success).toBe(false);
  });
  it('rejects a missing verifiedListenId', () => {
    const r = voteSchema.safeParse({ performanceId: UUID, ratings: { toneQuality: 50 } });
    expect(r.success).toBe(false);
  });
});

describe('listen schemas', () => {
  it('parses a valid listen event', () => {
    expect(
      listenEventSchema.safeParse({ kind: 'playing', atSeconds: 12.5, clientTs: 1000 }).success,
    ).toBe(true);
  });
  it('rejects an unknown event kind', () => {
    expect(
      listenEventSchema.safeParse({ kind: 'seeking', atSeconds: 0, clientTs: 1 }).success,
    ).toBe(false);
  });
  it('parses a complete listen payload', () => {
    const r = listenCompleteSchema.safeParse({
      performanceId: UUID,
      listenId: UUID2,
      durationS: 210,
      events: [{ kind: 'ended', atSeconds: 210, clientTs: 5 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an empty event trail', () => {
    const r = listenCompleteSchema.safeParse({
      performanceId: UUID,
      listenId: UUID2,
      durationS: 210,
      events: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('battleVoteSchema', () => {
  it('requires both listen ids and a winner', () => {
    const r = battleVoteSchema.safeParse({
      battleId: UUID,
      winnerPerformanceId: UUID2,
      listenAId: UUID,
      listenBId: UUID2,
    });
    expect(r.success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addPerformanceSchema,
  battleVoteSchema,
  calibrateSchema,
  dmcaActionSchema,
  dmcaSchema,
  listenCompleteSchema,
  listenEventSchema,
  moderateSchema,
  reportSchema,
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

describe('calibrateSchema', () => {
  it('accepts at least one criterion', () => {
    const r = calibrateSchema.safeParse({ performanceId: UUID, criteria: { toneQuality: 75 } });
    expect(r.success).toBe(true);
  });
  it('rejects an empty criteria object', () => {
    const r = calibrateSchema.safeParse({ performanceId: UUID, criteria: {} });
    expect(r.success).toBe(false);
  });
  it('rejects an out-of-range criterion', () => {
    const r = calibrateSchema.safeParse({ performanceId: UUID, criteria: { toneQuality: 150 } });
    expect(r.success).toBe(false);
  });
});

describe('moderation, report & dmca schemas', () => {
  it('reportSchema accepts a valid report', () => {
    expect(
      reportSchema.safeParse({ targetType: 'performance', targetId: UUID, reason: 'spam content' })
        .success,
    ).toBe(true);
  });
  it('reportSchema rejects a too-short reason', () => {
    expect(
      reportSchema.safeParse({ targetType: 'comment', targetId: UUID, reason: 'x' }).success,
    ).toBe(false);
  });
  it('dmcaSchema accepts a public filing with just a claimant', () => {
    expect(dmcaSchema.safeParse({ claimant: 'Rights Holder LLC' }).success).toBe(true);
  });
  it('moderateSchema accepts a resolve action', () => {
    expect(moderateSchema.safeParse({ flagId: UUID, status: 'resolved' }).success).toBe(true);
  });
  it('dmcaActionSchema accepts an actioned status', () => {
    expect(dmcaActionSchema.safeParse({ requestId: UUID, status: 'actioned' }).success).toBe(true);
  });
});

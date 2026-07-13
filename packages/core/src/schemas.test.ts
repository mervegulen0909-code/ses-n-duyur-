import { describe, expect, it } from 'vitest';
import {
  addPerformanceSchema,
  battlePredictSchema,
  battleVoteSchema,
  calibrateSchema,
  dmcaActionSchema,
  dmcaSchema,
  listenCompleteSchema,
  listenEventSchema,
  moderateSchema,
  pushRegisterSchema,
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

describe('battlePredictSchema — a game commitment, NOT a vote (no listen ids)', () => {
  it('accepts a battle + predicted winner pair', () => {
    const r = battlePredictSchema.safeParse({ battleId: UUID, predictedWinnerId: UUID2 });
    expect(r.success).toBe(true);
  });
  it('rejects a non-uuid predicted winner', () => {
    const r = battlePredictSchema.safeParse({ battleId: UUID, predictedWinnerId: 'perf-a' });
    expect(r.success).toBe(false);
  });
  it('rejects a missing battleId', () => {
    expect(battlePredictSchema.safeParse({ predictedWinnerId: UUID2 }).success).toBe(false);
  });
});

describe('reportSchema', () => {
  it('accepts a valid report', () => {
    const r = reportSchema.safeParse({
      targetType: 'performance',
      targetId: UUID,
      reason: 'spam content',
    });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown target type', () => {
    expect(
      reportSchema.safeParse({ targetType: 'song', targetId: UUID, reason: 'spam content' })
        .success,
    ).toBe(false);
  });
  it('rejects a too-short reason', () => {
    expect(
      reportSchema.safeParse({ targetType: 'comment', targetId: UUID, reason: 'x' }).success,
    ).toBe(false);
  });
});

describe('dmcaSchema', () => {
  it('accepts a minimal claim (claimant only)', () => {
    expect(dmcaSchema.safeParse({ claimant: 'Acme Records' }).success).toBe(true);
  });
  it('accepts a full claim with performance + details', () => {
    expect(
      dmcaSchema.safeParse({
        performanceId: UUID,
        claimant: 'Acme Records',
        details: 'Our master.',
      }).success,
    ).toBe(true);
  });
  it('rejects a too-short claimant', () => {
    expect(dmcaSchema.safeParse({ claimant: 'x' }).success).toBe(false);
  });
});

describe('moderateSchema', () => {
  it('accepts resolve/dismiss, optionally hiding a performance', () => {
    expect(moderateSchema.safeParse({ flagId: UUID, status: 'resolved' }).success).toBe(true);
    expect(
      moderateSchema.safeParse({ flagId: UUID, status: 'dismissed', hidePerformanceId: UUID2 })
        .success,
    ).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(moderateSchema.safeParse({ flagId: UUID, status: 'maybe' }).success).toBe(false);
  });
});

describe('dmcaActionSchema', () => {
  it('accepts action/reject, optionally naming a performance', () => {
    expect(dmcaActionSchema.safeParse({ requestId: UUID, status: 'actioned' }).success).toBe(true);
    expect(
      dmcaActionSchema.safeParse({ requestId: UUID, status: 'rejected', performanceId: UUID2 })
        .success,
    ).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(dmcaActionSchema.safeParse({ requestId: UUID, status: 'pending' }).success).toBe(false);
  });
});

describe('pushRegisterSchema', () => {
  it('accepts a valid ios/android token registration', () => {
    expect(
      pushRegisterSchema.safeParse({ token: 'ExponentPushToken[abc]', platform: 'ios' }).success,
    ).toBe(true);
    expect(
      pushRegisterSchema.safeParse({ token: 'ExponentPushToken[abc]', platform: 'android' })
        .success,
    ).toBe(true);
  });
  it('rejects an empty token', () => {
    expect(pushRegisterSchema.safeParse({ token: '', platform: 'ios' }).success).toBe(false);
  });
  it('rejects an unsupported platform', () => {
    expect(
      pushRegisterSchema.safeParse({ token: 'ExponentPushToken[abc]', platform: 'web' }).success,
    ).toBe(false);
  });
});

describe('calibrateSchema', () => {
  it('accepts at least one criterion', () => {
    const r = calibrateSchema.safeParse({ performanceId: UUID, criteria: { vocalAccuracy: 80 } });
    expect(r.success).toBe(true);
  });
  it('rejects an empty criteria object (the refine)', () => {
    const r = calibrateSchema.safeParse({ performanceId: UUID, criteria: {} });
    expect(r.success).toBe(false);
  });
  it('rejects an out-of-range criterion', () => {
    const r = calibrateSchema.safeParse({ performanceId: UUID, criteria: { vocalAccuracy: 150 } });
    expect(r.success).toBe(false);
  });
});

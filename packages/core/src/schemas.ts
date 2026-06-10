import { z } from 'zod';
import { CRITERIA } from '@vocal-league/scoring';
import { parseYouTubeId } from './youtube';

/** A 0–100 score for a single criterion. */
export const criterionScore = z.number().finite().min(0).max(100);

/** All 9 criteria, each 0–100. Keys match `@vocal-league/scoring` CRITERIA. */
export const criteriaScoresSchema = z.object(
  Object.fromEntries(CRITERIA.map((c) => [c, criterionScore])) as Record<
    (typeof CRITERIA)[number],
    typeof criterionScore
  >,
);

/** Add a performance: only the YouTube URL is required (must be parseable). */
export const addPerformanceSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .refine((v) => parseYouTubeId(v) !== null, { message: 'Not a valid YouTube video URL' }),
  songId: z.string().uuid().optional(),
});
export type AddPerformanceInput = z.infer<typeof addPerformanceSchema>;

/**
 * A vote. A vote is ONLY accepted with a `verifiedListenId` — the server
 * re-checks that the listen is valid and belongs to this user+performance.
 */
export const voteSchema = z.object({
  performanceId: z.string().uuid(),
  verifiedListenId: z.string().uuid(),
  ratings: criteriaScoresSchema.partial().refine((r) => Object.keys(r).length > 0, {
    message: 'At least one criterion rating is required',
  }),
});
export type VoteInput = z.infer<typeof voteSchema>;

/** A single client-reported listen event (server validates plausibility). */
export const listenEventSchema = z.object({
  kind: z.enum(['playing', 'paused', 'ended']),
  atSeconds: z.number().finite().min(0),
  clientTs: z.number().int().nonnegative(),
});
export type ListenEvent = z.infer<typeof listenEventSchema>;

/** Start a Verified Listen session for a performance. */
export const listenStartSchema = z.object({
  performanceId: z.string().uuid(),
});
export type ListenStartInput = z.infer<typeof listenStartSchema>;

/** Finalize a Verified Listen: the full event trail + the known duration. */
export const listenCompleteSchema = z.object({
  performanceId: z.string().uuid(),
  listenId: z.string().uuid(),
  durationS: z.number().finite().positive(),
  events: z.array(listenEventSchema).min(1),
});
export type ListenCompleteInput = z.infer<typeof listenCompleteSchema>;

/** Pick a battle winner — both listens must be referenced (server verifies). */
export const battleVoteSchema = z.object({
  battleId: z.string().uuid(),
  winnerPerformanceId: z.string().uuid(),
  listenAId: z.string().uuid(),
  listenBId: z.string().uuid(),
});
export type BattleVoteInput = z.infer<typeof battleVoteSchema>;

/** Post a comment on a performance. Body length mirrors the DB check (1–4000). */
export const commentSchema = z.object({
  performanceId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type CommentInput = z.infer<typeof commentSchema>;

/** A user reports content for moderation. */
export const reportSchema = z.object({
  targetType: z.enum(['performance', 'comment', 'profile']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});
export type ReportInput = z.infer<typeof reportSchema>;

/** Anyone may file a DMCA / takedown request (public form). */
export const dmcaSchema = z.object({
  performanceId: z.string().uuid().optional(),
  claimant: z.string().trim().min(2).max(200),
  details: z.string().trim().max(4000).optional(),
});
export type DmcaInput = z.infer<typeof dmcaSchema>;

/** Admin: resolve/dismiss a moderation flag, optionally hiding a performance. */
export const moderateSchema = z.object({
  flagId: z.string().uuid(),
  status: z.enum(['resolved', 'dismissed']),
  hidePerformanceId: z.string().uuid().optional(),
});
export type ModerateInput = z.infer<typeof moderateSchema>;

/** Admin: action/reject a DMCA request, optionally removing a performance. */
export const dmcaActionSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(['actioned', 'rejected']),
  performanceId: z.string().uuid().optional(),
});
export type DmcaActionInput = z.infer<typeof dmcaActionSchema>;

/** Admin: calibration scoring — the human anchor for the AI scoring model. */
export const calibrateSchema = z.object({
  performanceId: z.string().uuid(),
  criteria: criteriaScoresSchema
    .partial()
    .refine((r) => Object.keys(r).length > 0, { message: 'At least one criterion is required' }),
});
export type CalibrateInput = z.infer<typeof calibrateSchema>;

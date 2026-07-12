import { z } from 'zod';
import { CRITERIA } from '@voxscore/scoring';
import { songCategorySchema } from './categories';
import { parseYouTubeId } from './youtube';

/** A 0–100 score for a single criterion. */
export const criterionScore = z.number().finite().min(0).max(100);

/** All 9 criteria, each 0–100. Keys match `@voxscore/scoring` CRITERIA. */
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

/**
 * Request a battle pairing. Omitting `songId` pairs from the global pool
 * (preferring same-song pairs when available); passing it scopes the pairing
 * to ONLY that song's performances — this powers challenge/song-page battles.
 */
export const battleNextSchema = z.object({
  songId: z.string().uuid().optional(),
});
export type BattleNextInput = z.infer<typeof battleNextSchema>;

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

/** Register a device's Expo push token for the signed-in user (native push). */
export const pushRegisterSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(['ios', 'android']),
});
export type PushRegisterInput = z.infer<typeof pushRegisterSchema>;

/** One entry in a profile's external link list (max 5, enforced by profileUpdateSchema). */
export const profileLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url().max(300),
});
export type ProfileLink = z.infer<typeof profileLinkSchema>;

/**
 * Self-service profile edit: bio, avatar, and up to 5 links. avatarUrl's
 * SHAPE is validated here; the server additionally checks it is a same-
 * origin Supabase Storage URL under the caller's own avatars/<uid>/ folder
 * (never an arbitrary external URL — stored-XSS-via-profile risk otherwise).
 */
export const profileUpdateSchema = z.object({
  bio: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
  links: z.array(profileLinkSchema).max(5).optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Follow/unfollow another creator by handle. The server resolves the handle to
 * an id; RLS enforces follower_id = auth.uid() and the DB blocks self-follows.
 */
export const followSchema = z.object({
  followeeHandle: z.string().trim().min(1).max(64),
});
export type FollowInput = z.infer<typeof followSchema>;

/**
 * A user appeals a moderation decision (a hidden performance, a removed
 * comment, a rejected performance request). Mirrors performanceRequestSchema.
 */
export const appealSchema = z.object({
  targetType: z.enum(['performance', 'comment', 'performance_request']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2000),
});
export type AppealInput = z.infer<typeof appealSchema>;

/** Admin: uphold or deny a pending appeal. */
export const appealActionSchema = z
  .object({
    appealId: z.string().uuid(),
    action: z.enum(['uphold', 'deny']),
    resolutionNote: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((v) => v.action !== 'deny' || !!v.resolutionNote, {
    message: 'A resolution note is required when denying',
  });
export type AppealActionInput = z.infer<typeof appealActionSchema>;

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

/**
 * A user asks for a YouTube performance to be scored and added to the league.
 * Requests land in an admin approval queue — they NEVER create a performance
 * directly (see /api/performance-requests).
 */
export const performanceRequestSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .refine((v) => parseYouTubeId(v) !== null, { message: 'Not a valid YouTube video URL' }),
  category: songCategorySchema,
  note: z.string().trim().max(1000).optional(),
});
export type PerformanceRequestInput = z.infer<typeof performanceRequestSchema>;

/** Admin: approve or reject a pending performance request. */
export const performanceRequestActionSchema = z
  .object({
    requestId: z.string().uuid(),
    action: z.enum(['approve', 'reject']),
    rejectionReason: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((v) => v.action !== 'reject' || !!v.rejectionReason, {
    message: 'A rejection reason is required when rejecting',
  });
export type PerformanceRequestActionInput = z.infer<typeof performanceRequestActionSchema>;

/**
 * Privacy-preserving product analytics event. `sessionId` is a client-generated
 * random UUID (not a tracking cookie), `meta` must never contain personal data
 * or YouTube media data — only ids and enum-ish strings.
 */
export const ANALYTICS_EVENTS = [
  'landing_view',
  'signup_started',
  'signup_completed',
  'performance_request_submitted',
  'performance_request_approved',
  'verified_listen_completed',
  'vote_submitted',
  'battle_completed',
  'share_clicked',
  'challenge_opened',
  'invite_converted',
  // k-factor funnel: artifact shown → link visited → guest engaged.
  'share_rendered',
  'challenge_link_visited',
  'guest_battle_started',
  // Prediction pools (listener game — NOT a vote).
  'prediction_submitted',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const analyticsEventSchema = z.object({
  event: z.enum(ANALYTICS_EVENTS),
  sessionId: z.string().uuid(),
  meta: z.record(z.string(), z.union([z.string().max(200), z.number()])).optional(),
});
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

/** Admin: resolve/dismiss a moderation flag, optionally hiding a performance. */
/**
 * The notifications SEND-queue kind catalog (mirrors ANALYTICS_EVENTS).
 * Rows are written server-side only (service role); a scheduled sender
 * drains sent_at IS NULL rows via the Expo Push API. Not every kind has a
 * real trigger wired yet (battle_challenge / rank_change / comment_reply
 * have no corresponding server event in this codebase today) — the enum
 * stays complete per the design doc so the check constraint and future
 * wiring do not need a migration.
 */
export const NOTIFICATION_KINDS = [
  'battle_challenge',
  'new_vote',
  'rank_change',
  'comment_reply',
  'performance_request_approved',
  'performance_request_rejected',
  'day1_comeback',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Admin: open a new season, closing the currently open one (if any). */
export const seasonCreateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  startsAt: z.string().datetime().optional(),
});
export type SeasonCreateInput = z.infer<typeof seasonCreateSchema>;

/** Admin: re-score mock-scored rows with the real provider, in small batches. */
export const rescoreSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
});
export type RescoreInput = z.infer<typeof rescoreSchema>;

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

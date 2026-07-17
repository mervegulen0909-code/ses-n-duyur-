import { clamp, round } from '@voxscore/scoring';
import type { ListenEvent } from './schemas';

export interface ListenValidation {
  readonly isValid: boolean;
  /** Fraction [0,1] of the video genuinely watched. */
  readonly watchedPct: number;
  readonly reason?: string;
}

export interface ValidateListenOptions {
  /** Minimum genuine coverage to count as a Verified Listen (default 0.9). */
  readonly minWatchedPct?: number;
  /** Allowed forward jump (s) beyond elapsed wall-clock before it's a seek (default 2). */
  readonly maxJumpS?: number;
  /**
   * SERVER-trusted wall-clock seconds the session was open (now − session
   * created_at). When provided, genuine playback cannot exceed real elapsed time:
   * a client claiming more covered seconds than actually elapsed server-side is
   * rejected. This is the anchor that makes the gate unforgeable — `durationS`
   * and the event trail are client-supplied, but real elapsed time is not.
   */
  readonly serverElapsedS?: number;
  /**
   * Absolute minimum seconds of genuine playback required (default 0 = off).
   * Defeats the tiny-`durationS` trick (claiming ~100% of a 1-second "video"):
   * a real Verified Listen must cover at least this many seconds of content.
   */
  readonly minWatchSeconds?: number;
}

/**
 * Server-side anti-cheat for Verified Listen. NEVER trust the client: we only
 * count playback that advanced consistently with wall-clock time. A scrub/skip
 * to the end (position jumps far beyond elapsed real time) is NOT counted, so
 * the user must actually let the video play to reach the threshold.
 *
 * Both the event trail and `durationS` are client-supplied, so neither alone can
 * be trusted. Callers MUST pass `serverElapsedS` (and a `minWatchSeconds` floor)
 * so the result is anchored to facts the server owns — see ValidateListenOptions.
 *
 * Pure — operates on the reported event trail + known duration + server anchors.
 */
export function validateListen(
  events: readonly ListenEvent[],
  durationS: number,
  opts?: ValidateListenOptions,
): ListenValidation {
  const minWatchedPct = opts?.minWatchedPct ?? 0.9;
  const maxJumpS = opts?.maxJumpS ?? 2;
  const minWatchSeconds = opts?.minWatchSeconds ?? 0;

  if (!(durationS > 0)) return { isValid: false, watchedPct: 0, reason: 'invalid duration' };
  if (events.length === 0) return { isValid: false, watchedPct: 0, reason: 'no events' };

  const sorted = [...events].sort((a, b) => a.clientTs - b.clientTs);

  let coveredSeconds = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    // Only count time while playing.
    if (prev.kind !== 'playing') continue;
    const wallDelta = (cur.clientTs - prev.clientTs) / 1000;
    const posDelta = cur.atSeconds - prev.atSeconds;
    // Legitimate playback advances forward, roughly in step with real time.
    if (posDelta > 0 && posDelta <= wallDelta + maxJumpS) {
      coveredSeconds += posDelta;
    }
  }

  const watchedPct = round(clamp(coveredSeconds / durationS, 0, 1), 4);

  // SERVER anchor: you cannot accumulate more genuine playback than real time
  // elapsed on the server. Forging a long, internally-consistent trail can't beat
  // this — the wall-clock between session start and completion is server-owned.
  if (opts?.serverElapsedS !== undefined && coveredSeconds > opts.serverElapsedS + maxJumpS) {
    return { isValid: false, watchedPct, reason: 'reported playback exceeds real elapsed time' };
  }

  // Absolute floor: defeats inflating watchedPct via a tiny client `durationS`.
  if (coveredSeconds < minWatchSeconds) {
    return {
      isValid: false,
      watchedPct,
      reason: `insufficient playback: ${coveredSeconds.toFixed(0)}s < required ${minWatchSeconds}s`,
    };
  }

  if (watchedPct < minWatchedPct) {
    return {
      isValid: false,
      watchedPct,
      reason: `watched ${(watchedPct * 100).toFixed(0)}% < required ${(minWatchedPct * 100).toFixed(0)}%`,
    };
  }
  return { isValid: true, watchedPct };
}

/**
 * Minimum seconds of genuine in-step playback for a YouTube Verified Listen.
 * Without a trusted video length (oEmbed exposes none), this absolute floor —
 * combined with the server wall-clock anchor — is what makes the listen real:
 * the user must actually spend this long with the embed playing. 30s is the
 * anti-bot COST of a vote (Hard Rule 4): a fleet of fake accounts must pay
 * real, server-verified wall-clock time per listen, and no one can fairly
 * judge a vocal performance on less.
 */
export const MIN_VERIFIED_LISTEN_SECONDS = 30;

/**
 * Fraction of the SERVER-trusted video length that must be genuinely watched for
 * a Verified Listen (Hard Rule 4/5: "vote only after listening to the whole
 * performance"). Enforced against the YouTube Data API duration — never a
 * client-supplied length — so it cannot be gamed by shrinking `durationS`. The
 * 30s floor above still applies underneath, so very short clips (whose 90% is
 * under the floor) can never unlock a vote.
 */
export const MIN_VERIFIED_LISTEN_WATCHED_PCT = 0.9;

/**
 * Client-side point at which the event trail is submitted for verification.
 *
 * The IFrame player's duration can be a few seconds shorter than the canonical
 * YouTube Data API duration used by the server. Submitting at the exact 90%
 * server threshold can therefore turn an honest full watch into an 89% reject
 * and, because completion is intentionally single-shot, prevent the `ended`
 * event from retrying. The client waits for 95% to leave a small metadata
 * margin; this does not weaken the server-side 90% gate or its wall-clock and
 * playback-continuity checks.
 */
export const VERIFIED_LISTEN_CLIENT_SUBMIT_PCT = 0.95;

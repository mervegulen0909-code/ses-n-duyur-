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
}

/**
 * Server-side anti-cheat for Verified Listen. NEVER trust the client: we only
 * count playback that advanced consistently with wall-clock time. A scrub/skip
 * to the end (position jumps far beyond elapsed real time) is NOT counted, so
 * the user must actually let the video play to reach the threshold.
 *
 * Pure — operates on the reported event trail + known duration.
 */
export function validateListen(
  events: readonly ListenEvent[],
  durationS: number,
  opts?: ValidateListenOptions,
): ListenValidation {
  const minWatchedPct = opts?.minWatchedPct ?? 0.9;
  const maxJumpS = opts?.maxJumpS ?? 2;

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
  if (watchedPct < minWatchedPct) {
    return {
      isValid: false,
      watchedPct,
      reason: `watched ${(watchedPct * 100).toFixed(0)}% < required ${(minWatchedPct * 100).toFixed(0)}%`,
    };
  }
  return { isValid: true, watchedPct };
}

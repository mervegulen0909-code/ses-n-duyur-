/**
 * Normalizes a `scores` row into the two fields the UI cards need. An absent
 * score (no row yet) is treated as provisional with no current value — the same
 * default the leaderboard and profile already use. Centralized so every surface
 * that shows an AI score also knows whether it must carry the Provisional badge
 * (CLAUDE.md rule #2: YouTube-content scores are never real measurements).
 */
export interface ScoreRow {
  current_score: number | null;
  is_provisional: boolean | null;
}

export interface ScoreView {
  currentScore: number | null;
  isProvisional: boolean;
}

export function toScoreView(score: ScoreRow | undefined): ScoreView {
  return {
    currentScore: score?.current_score ?? null,
    isProvisional: score?.is_provisional ?? true,
  };
}

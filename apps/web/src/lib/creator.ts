/**
 * Pure aggregation for a creator's public profile. Kept free of Supabase so it
 * can be unit-tested in isolation; the page hands it the rows it has already
 * fetched. Mirrors the leaderboard's title/score-map shape.
 */

/** A performance row as selected on the profile page. */
export interface CreatorPerf {
  id: string;
  oembed_meta: unknown;
  battle_wins: number;
  battle_count: number;
}

/** A score row as selected on the profile page. */
export interface CreatorScore {
  performance_id: string;
  current_score: number | null;
  is_provisional: boolean | null;
}

/** One performance as rendered in the creator's list. */
export interface CreatorRow {
  id: string;
  title: string;
  currentScore: number | null;
  isProvisional: boolean;
  wins: number;
  battles: number;
}

/** Aggregate stats + the ranked performance list for a creator. */
export interface CreatorSummary {
  totalPerformances: number;
  wins: number;
  losses: number;
  battles: number;
  /** Win share across all battles, 0–1; null when the creator has no battles. */
  winRate: number | null;
  /** Performances sorted by current score (desc); nulls sort last. */
  rows: CreatorRow[];
}

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? 'Untitled performance';
}

export function summarizeCreator(
  perfs: readonly CreatorPerf[],
  scores: readonly CreatorScore[],
): CreatorSummary {
  const scoreByPerf = new Map(scores.map((s) => [s.performance_id, s]));

  const rows: CreatorRow[] = perfs
    .map((p) => {
      const s = scoreByPerf.get(p.id);
      return {
        id: p.id,
        title: titleOf(p.oembed_meta),
        currentScore: s?.current_score ?? null,
        // Absent score => treat as provisional (matches the leaderboard default).
        isProvisional: s?.is_provisional ?? true,
        wins: p.battle_wins,
        battles: p.battle_count,
      };
    })
    .sort((a, b) => (b.currentScore ?? -1) - (a.currentScore ?? -1));

  const wins = perfs.reduce((acc, p) => acc + p.battle_wins, 0);
  const battles = perfs.reduce((acc, p) => acc + p.battle_count, 0);

  return {
    totalPerformances: perfs.length,
    wins,
    losses: battles - wins,
    battles,
    winRate: battles > 0 ? wins / battles : null,
    rows,
  };
}

import {
  CRITERIA,
  composeInitialAiScore,
  type CriteriaScores,
  type Criterion,
} from '@vocal-league/scoring';

/** Input to a scoring provider. For YouTube sources this is metadata only. */
export interface ScoringInput {
  readonly videoId: string;
  readonly title: string;
  readonly authorName: string;
  readonly hasVideo: boolean;
  /** Optional public transcript/caption text (never downloaded audio). */
  readonly transcript?: string;
}

export interface ScoringResult {
  readonly initialAiScore: number;
  readonly breakdown: CriteriaScores;
  /**
   * MVP YouTube scores are ALWAYS provisional — they are an LLM/heuristic
   * estimate, never a real audio measurement. Surfaced to users as
   * "Provisional AI Estimate".
   */
  readonly provisional: boolean;
  readonly model: string;
}

export interface ScoringProvider {
  score(input: ScoringInput): Promise<ScoringResult>;
}

/** Deterministic 32-bit FNV-1a hash — stable across runs (no randomness). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * MockScoringProvider — a deterministic, clearly-provisional stand-in used in
 * development. It produces a stable per-criterion breakdown from the metadata
 * hash (range ~55–92) and composes it with the real scoring math.
 *
 * Faz J swaps this for an AnthropicScoringProvider behind the same interface.
 */
export class MockScoringProvider implements ScoringProvider {
  async score(input: ScoringInput): Promise<ScoringResult> {
    const seed = hash(`${input.videoId}:${input.title}:${input.authorName}`);

    const breakdown = Object.fromEntries(
      CRITERIA.map((criterion, i) => {
        // Spread values deterministically across [55, 92].
        const raw = (seed >>> (i % 24)) % 38;
        return [criterion, 55 + raw];
      }),
    ) as Record<Criterion, number>;

    const initialAiScore = composeInitialAiScore(breakdown, { hasVideo: input.hasVideo });

    return {
      initialAiScore,
      breakdown,
      provisional: true,
      model: 'mock-provisional-v0',
    };
  }
}

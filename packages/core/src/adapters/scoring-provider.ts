import {
  CRITERIA,
  composeInitialAiScore,
  type CriteriaScores,
  type Criterion,
} from '@voxscore/scoring';

/** Input to a scoring provider. For YouTube sources this is metadata only. */
export interface ScoringInput {
  readonly videoId: string;
  readonly title: string;
  readonly authorName: string;
  readonly hasVideo: boolean;
  /** Optional public transcript/caption text (never downloaded audio). */
  readonly transcript?: string;
}

/**
 * The active scoring regime. Bump when anything that changes the score
 * DISTRIBUTION changes: provider switch, model switch, prompt/rubric edits,
 * quantization rules. v2 (2026-07-10) = deterministic regime (pinned model
 * snapshots, temperature 0, rubric-anchored prompt, multiples-of-5 scores).
 * v3 (2026-07-11) = provider order becomes OpenAI → Gemini → mock (Anthropic
 * retired from the default order for cost); same determinism rules.
 * Persisted on every score row so old and new regimes stay distinguishable.
 */
export const SCORING_VERSION = 3;

/** Which backend produced an AI estimate — persisted for provenance. */
export type ScoringProviderName = 'anthropic' | 'openai' | 'gemini' | 'mock';

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
  /**
   * Provider provenance. When a real provider silently degrades to the mock
   * fallback, this MUST say 'mock' — the score row records what actually
   * produced the numbers, never what was merely configured.
   */
  readonly provider: ScoringProviderName;
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
      provider: 'mock',
    };
  }
}

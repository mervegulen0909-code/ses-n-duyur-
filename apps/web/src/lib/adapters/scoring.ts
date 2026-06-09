import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// Anthropic's zod helper is typed against Zod v4; zod@3.25 exposes it at zod/v4.
import { z } from 'zod/v4';
import {
  CRITERIA,
  clamp,
  composeInitialAiScore,
  type CriteriaScores,
  type Criterion,
} from '@vocal-league/scoring';
import {
  MockScoringProvider,
  type ScoringInput,
  type ScoringProvider,
  type ScoringResult,
} from '@vocal-league/core';

const SCORING_MODEL = 'claude-opus-4-8';

// 9-criteria estimate. Structured outputs strip numeric min/max and validate
// client-side, so the bounds are advisory to the model + enforced by Zod.
const criteriaShape = Object.fromEntries(
  CRITERIA.map((c) => [c, z.number().min(0).max(100)]),
) as Record<Criterion, z.ZodNumber>;
const CriteriaEstimateSchema = z.object(criteriaShape);

const SYSTEM = `You estimate vocal-performance quality for a music league.
You are given ONLY text metadata (title, artist, optional transcript) for a
YouTube performance — you are NOT given the audio. Produce a PROVISIONAL,
interpretive estimate for each of the 9 criteria on a 0-100 scale.
This is an explicitly provisional estimate, never a real audio measurement.
Do not claim to have measured pitch, timing, or any acoustic feature. When the
metadata is thin, estimate conservatively toward the middle of the range.`;

/**
 * AnthropicScoringProvider — produces a clearly-provisional LLM estimate of the
 * 9 criteria from metadata (never audio). Activated by getScoringProvider()
 * only when ANTHROPIC_API_KEY is set; otherwise the mock is used. Falls back to
 * the mock on any API error so adding a performance never hard-fails.
 */
export class AnthropicScoringProvider implements ScoringProvider {
  private readonly client: Anthropic;
  private readonly fallback = new MockScoringProvider();

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async score(input: ScoringInput): Promise<ScoringResult> {
    try {
      const transcript = input.transcript ? `\nTranscript excerpt:\n${input.transcript}` : '';
      const response = await this.client.messages.parse({
        model: SCORING_MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        output_config: { format: zodOutputFormat(CriteriaEstimateSchema) },
        messages: [
          {
            role: 'user',
            content: `Title: ${input.title}\nArtist/Channel: ${input.authorName}\nHas video: ${input.hasVideo}${transcript}`,
          },
        ],
      });

      if (!response.parsed_output) return this.fallback.score(input);

      const breakdown = Object.fromEntries(
        CRITERIA.map((c) => [c, clamp(response.parsed_output![c], 0, 100)]),
      ) as CriteriaScores;

      return {
        initialAiScore: composeInitialAiScore(breakdown, { hasVideo: input.hasVideo }),
        breakdown,
        provisional: true,
        model: SCORING_MODEL,
      };
    } catch {
      return this.fallback.score(input);
    }
  }
}

/** Returns the real provider when ANTHROPIC_API_KEY is set, else the dev mock. */
export function getScoringProvider(): ScoringProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicScoringProvider(key) : new MockScoringProvider();
}

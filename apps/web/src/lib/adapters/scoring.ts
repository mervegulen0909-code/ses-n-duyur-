import 'server-only';
import OpenAI from 'openai';
import { CRITERIA, clamp, composeInitialAiScore, type CriteriaScores } from '@voxscore/scoring';
import {
  MockScoringProvider,
  type ScoringInput,
  type ScoringProvider,
  type ScoringResult,
} from '@voxscore/core';

// Default scoring model. Override with OPENAI_SCORING_MODEL env if desired.
const SCORING_MODEL = process.env.OPENAI_SCORING_MODEL ?? 'gpt-4o-mini';

const SYSTEM = `You estimate vocal-performance quality for a music league.
You are given ONLY text metadata (title, artist/channel, optional transcript) for
a YouTube performance — you are NOT given the audio. Produce a PROVISIONAL,
interpretive estimate for each criterion on a 0-100 scale. This is explicitly a
provisional estimate, never a real audio measurement — never claim to have
measured pitch, timing, or any acoustic feature. When metadata is thin, estimate
conservatively toward the middle. Respond with ONLY a JSON object whose keys are
exactly: ${CRITERIA.join(', ')} — each an integer 0-100.`;

/**
 * OpenAIScoringProvider — clearly-provisional LLM estimate of the 9 criteria
 * from metadata (never audio). Activated by getScoringProvider() only when
 * OPENAI_API_KEY is set; otherwise the dev mock is used. Falls back to the mock
 * on any API/parse error so adding a performance never hard-fails.
 */
export class OpenAIScoringProvider implements ScoringProvider {
  private readonly client: OpenAI;
  private readonly fallback = new MockScoringProvider();

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async score(input: ScoringInput): Promise<ScoringResult> {
    try {
      const transcript = input.transcript ? `\nTranscript excerpt:\n${input.transcript}` : '';
      const completion = await this.client.chat.completions.create({
        model: SCORING_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Title: ${input.title}\nArtist/Channel: ${input.authorName}\nHas video: ${input.hasVideo}${transcript}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return this.fallback.score(input);
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const breakdown = Object.fromEntries(
        CRITERIA.map((c) => {
          const n = Number(parsed[c]);
          return [c, clamp(Number.isFinite(n) ? n : 50, 0, 100)];
        }),
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

/** Returns the real provider when OPENAI_API_KEY is set, else the dev mock. */
export function getScoringProvider(): ScoringProvider {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAIScoringProvider(key) : new MockScoringProvider();
}

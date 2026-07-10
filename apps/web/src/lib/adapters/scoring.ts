import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { CRITERIA, clamp, composeInitialAiScore, type CriteriaScores } from '@voxscore/scoring';
import {
  MockScoringProvider,
  type ScoringInput,
  type ScoringProvider,
  type ScoringResult,
} from '@voxscore/core';

// SCORING CONSISTENCY CONTRACT
// ----------------------------
// League fairness demands that the SAME input always yields the SAME estimate,
// as far as an LLM allows. Every knob below serves that:
//   - models are pinned to dated snapshots (a floating alias like "gpt-4o-mini"
//     silently changes scoring behavior when the vendor updates it);
//   - temperature is 0 (greedy decoding) and OpenAI gets a fixed seed;
//   - the rubric anchors what each band means, so estimates don't freestyle;
//   - scores are quantized to multiples of 5 (absorbs residual logit jitter);
//   - each performance is scored ONCE at insert and duplicates of the same
//     video are rejected (unique index), so users can never observe two
//     different scores for the same video.
// Switching providers (Anthropic <-> OpenAI) shifts the score distribution:
// keep ONE provider active per league season; if you must switch, bump
// SCORING_VERSION in @voxscore/core so old and new scores are distinguishable.

// Default scoring model — a PINNED snapshot. Override with OPENAI_SCORING_MODEL.
const SCORING_MODEL = process.env.OPENAI_SCORING_MODEL ?? 'gpt-4o-mini-2024-07-18';

// Best-effort determinism for OpenAI (with temperature 0 and a pinned snapshot).
const OPENAI_SEED = 42;

// Default Anthropic scoring model — already a dated snapshot; Haiku is plenty
// for a small JSON estimate. Override with ANTHROPIC_SCORING_MODEL.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_SCORING_MODEL ?? 'claude-haiku-4-5-20251001';

const SYSTEM = `You estimate vocal-performance quality for a music league.
You are given ONLY text metadata (title, artist/channel, optional transcript) for
a YouTube performance — you are NOT given the audio. Produce a PROVISIONAL,
interpretive estimate for each criterion on a 0-100 scale. This is explicitly a
provisional estimate, never a real audio measurement — never claim to have
measured pitch, timing, or any acoustic feature.

Rubric — apply it identically to every request:
- 90-100 exceptional, professional-grade signals in the metadata
- 75-89  strong signals (established artist/channel, official release)
- 60-74  competent (typical decent cover/performance signals)
- 40-59  average or UNKNOWN — the default band when metadata gives little signal
- 0-39   clearly weak signals
Rules: every score MUST be an integer multiple of 5. Judge only from the given
metadata; identical metadata must always produce identical scores. Respond with
ONLY a JSON object whose keys are exactly: ${CRITERIA.join(', ')}.`;

/**
 * Quantize a raw model score to the league scale: integer multiples of 5,
 * clamped to [0, 100]. Absorbs small run-to-run jitter so near-identical model
 * outputs collapse to the same published score.
 */
function quantize(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 50;
  return clamp(Math.round(v / 5) * 5, 0, 100);
}

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
        // Determinism: greedy decoding + fixed seed (see consistency contract).
        temperature: 0,
        seed: OPENAI_SEED,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Title: ${input.title}\nArtist/Channel: ${input.authorName}\nHas video: ${input.hasVideo}${transcript}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        console.error('[scoring] OpenAI returned empty content; falling back to mock estimate');
        return this.fallback.score(input);
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const breakdown = Object.fromEntries(
        CRITERIA.map((c) => [c, quantize(parsed[c])]),
      ) as CriteriaScores;

      return {
        initialAiScore: composeInitialAiScore(breakdown, { hasVideo: input.hasVideo }),
        breakdown,
        provisional: true,
        model: SCORING_MODEL,
      };
    } catch (err) {
      // Degrade to the deterministic mock so adding a performance never fails,
      // but surface WHY (invalid key, rate limit, bad model id) in server logs —
      // otherwise a misconfigured OPENAI_API_KEY silently scores as mock forever.
      console.error('[scoring] OpenAI provider failed; falling back to mock estimate:', err);
      return this.fallback.score(input);
    }
  }
}

/**
 * AnthropicScoringProvider — clearly-provisional Claude estimate of the 9
 * criteria from metadata (never audio). Preferred provider (see CLAUDE.md:
 * default to the latest Claude models). Activated by getScoringProvider() when
 * ANTHROPIC_API_KEY is set. Falls back to the mock on any API/parse error so
 * adding a performance never hard-fails.
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
      const message = await this.client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        // Determinism: greedy decoding (see consistency contract above).
        temperature: 0,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Title: ${input.title}\nArtist/Channel: ${input.authorName}\nHas video: ${input.hasVideo}${transcript}`,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === 'text');
      const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      // The model is instructed to return ONLY JSON; slice defensively in case it
      // wraps the object in prose.
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) {
        console.error(
          '[scoring] Anthropic reply had no JSON object; falling back to mock estimate',
        );
        return this.fallback.score(input);
      }
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

      const breakdown = Object.fromEntries(
        CRITERIA.map((c) => [c, quantize(parsed[c])]),
      ) as CriteriaScores;

      return {
        initialAiScore: composeInitialAiScore(breakdown, { hasVideo: input.hasVideo }),
        breakdown,
        provisional: true,
        model: ANTHROPIC_MODEL,
      };
    } catch (err) {
      // Degrade to the deterministic mock so adding a performance never fails,
      // but surface WHY (invalid key, rate limit, bad model id) in server logs —
      // otherwise a misconfigured ANTHROPIC_API_KEY silently scores as mock forever.
      console.error('[scoring] Anthropic provider failed; falling back to mock estimate:', err);
      return this.fallback.score(input);
    }
  }
}

/**
 * Returns the real scoring provider based on which API key is configured:
 * Anthropic (Claude, preferred) → OpenAI → deterministic dev mock. All embed
 * scores stay PROVISIONAL regardless of provider.
 */
export function getScoringProvider(): ScoringProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return new AnthropicScoringProvider(anthropicKey);
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return new OpenAIScoringProvider(openaiKey);
  return new MockScoringProvider();
}

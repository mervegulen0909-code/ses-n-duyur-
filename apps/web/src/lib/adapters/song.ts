import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  MockSongExtractor,
  normalizeSongKey,
  type SongExtractInput,
  type SongExtractor,
  type SongGuess,
} from '@voxscore/core';

// Same determinism regime as scoring (temperature 0, pinned snapshots) — and a
// DELIBERATELY SEPARATE call: folding extraction into the scoring prompt would
// change scoring outputs and invalidate the scoring_version-2 contract.
const OPENAI_MODEL = process.env.OPENAI_SCORING_MODEL ?? 'gpt-4o-mini-2024-07-18';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_SCORING_MODEL ?? 'claude-haiku-4-5-20251001';

const SYSTEM = `You identify which SONG a YouTube vocal-performance video is of,
from its title and channel name only. Think "Adele - Hello (Cover by Jane)" →
the song is "Hello" by "Adele" (the ORIGINAL artist, not the performer/channel).
Respond with ONLY a JSON object: {"songTitle": string|null, "songArtist": string|null}.
songTitle is the canonical song name WITHOUT decorations like (cover), (live),
(official video). songArtist is the original artist, or null if unknown. If you
cannot confidently identify a song, return {"songTitle": null, "songArtist": null}.
Identical input must always produce identical output.`;

function toGuess(parsed: Record<string, unknown>): SongGuess | null {
  const title = typeof parsed.songTitle === 'string' ? parsed.songTitle.trim().slice(0, 200) : '';
  if (!title) return null;
  const artist =
    typeof parsed.songArtist === 'string' && parsed.songArtist.trim()
      ? parsed.songArtist.trim().slice(0, 200)
      : null;
  // Guard against degenerate extractions that normalize to nothing.
  if (!normalizeSongKey(artist, title)) return null;
  return { title, artist };
}

function userPrompt(input: SongExtractInput): string {
  return `Video title: ${input.title}\nChannel: ${input.authorName}`;
}

/** Claude-based extractor (preferred, mirrors the scoring provider order). */
export class AnthropicSongExtractor implements SongExtractor {
  private readonly client: Anthropic;
  private readonly fallback = new MockSongExtractor();

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(input: SongExtractInput): Promise<SongGuess | null> {
    try {
      const message = await this.client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 256,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt(input) }],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) return this.fallback.extract(input);
      return toGuess(JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>);
    } catch (err) {
      // A missing song link only weakens matchmaking — never fail the add.
      console.error('[song] Anthropic extractor failed; using heuristic fallback:', err);
      return this.fallback.extract(input);
    }
  }
}

/** OpenAI-based extractor (fallback provider). */
export class OpenAISongExtractor implements SongExtractor {
  private readonly client: OpenAI;
  private readonly fallback = new MockSongExtractor();

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async extract(input: SongExtractInput): Promise<SongGuess | null> {
    try {
      const completion = await this.client.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0,
        seed: 42,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPrompt(input) },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) return this.fallback.extract(input);
      return toGuess(JSON.parse(raw) as Record<string, unknown>);
    } catch (err) {
      console.error('[song] OpenAI extractor failed; using heuristic fallback:', err);
      return this.fallback.extract(input);
    }
  }
}

/** Provider order mirrors getScoringProvider(): Anthropic → OpenAI → heuristic. */
export function getSongExtractor(): SongExtractor {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return new AnthropicSongExtractor(anthropicKey);
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return new OpenAISongExtractor(openaiKey);
  return new MockSongExtractor();
}

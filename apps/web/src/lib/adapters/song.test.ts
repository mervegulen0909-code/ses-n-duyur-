import { afterEach, describe, expect, it, vi } from 'vitest';

const openaiCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

const anthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

import { MockSongExtractor } from '@voxscore/core';
import { AnthropicSongExtractor, OpenAISongExtractor, getSongExtractor } from './song';

const INPUT = { title: 'Adele - Hello (Cover by Jane)', authorName: 'Jane Doe' };
const GOOD = JSON.stringify({ songTitle: 'Hello', songArtist: 'Adele' });

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('song extraction — same determinism regime as scoring', () => {
  it('OpenAI extractor: temperature 0, fixed seed, pinned snapshot', async () => {
    openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: GOOD } }] });
    const res = await new OpenAISongExtractor('k').extract(INPUT);

    const req = openaiCreate.mock.calls[0]![0];
    expect(req.temperature).toBe(0);
    expect(req.seed).toBe(42);
    expect(req.model).toMatch(/\d{4}-\d{2}-\d{2}$/);
    expect(res).toEqual({ title: 'Hello', artist: 'Adele' });
  });

  it('Anthropic extractor: temperature 0, dated snapshot, prose-wrapped JSON ok', async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: `Sure!\n${GOOD}` }],
    });
    const res = await new AnthropicSongExtractor('k').extract(INPUT);

    const req = anthropicCreate.mock.calls[0]![0];
    expect(req.temperature).toBe(0);
    expect(req.model).toMatch(/\d{8}$/);
    expect(res).toEqual({ title: 'Hello', artist: 'Adele' });
  });

  it('returns null (no song link) when the model cannot identify a song', async () => {
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ songTitle: null, songArtist: null }) } }],
    });
    expect(await new OpenAISongExtractor('k').extract(INPUT)).toBeNull();
  });

  it('falls back to the deterministic heuristic on provider error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openaiCreate.mockRejectedValueOnce(new Error('boom'));
    // Heuristic parses "Artist - Song" from the raw title.
    expect(await new OpenAISongExtractor('k').extract(INPUT)).toEqual({
      title: 'Hello',
      artist: 'Adele',
    });
  });

  it('provider order mirrors scoring: Anthropic → OpenAI → heuristic mock', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    vi.stubEnv('OPENAI_API_KEY', 'o');
    expect(getSongExtractor()).toBeInstanceOf(AnthropicSongExtractor);
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(getSongExtractor()).toBeInstanceOf(OpenAISongExtractor);
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(getSongExtractor()).toBeInstanceOf(MockSongExtractor);
  });
});

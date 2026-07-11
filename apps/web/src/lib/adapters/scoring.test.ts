import { afterEach, describe, expect, it, vi } from 'vitest';

// Capture the request params each SDK is called with, and control the reply.
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

import { CRITERIA } from '@voxscore/scoring';
import {
  AnthropicScoringProvider,
  GeminiScoringProvider,
  OpenAIScoringProvider,
  getScoringProvider,
} from './scoring';

const INPUT = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up',
  authorName: 'Rick Astley',
  hasVideo: true,
};

/** A well-formed model reply: every criterion 82 (NOT a multiple of 5). */
const RAW_82 = JSON.stringify(Object.fromEntries(CRITERIA.map((c) => [c, 82])));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('scoring determinism contract (league fairness)', () => {
  it('OpenAI is called with temperature 0, a fixed seed, and a PINNED model snapshot', async () => {
    openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: RAW_82 } }] });
    await new OpenAIScoringProvider('k').score(INPUT);

    const req = openaiCreate.mock.calls[0]![0];
    expect(req.temperature).toBe(0);
    expect(req.seed).toBe(42);
    // A floating alias (e.g. "gpt-4o-mini") would silently change scoring when
    // the vendor updates it — the default must be a dated snapshot.
    expect(req.model).toMatch(/\d{4}-\d{2}-\d{2}$/);
    expect(req.response_format).toEqual({ type: 'json_object' });
  });

  it('Anthropic is called with temperature 0 and a dated model snapshot', async () => {
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: RAW_82 }] });
    await new AnthropicScoringProvider('k').score(INPUT);

    const req = anthropicCreate.mock.calls[0]![0];
    expect(req.temperature).toBe(0);
    expect(req.model).toMatch(/\d{8}$/);
  });

  it('quantizes every criterion to multiples of 5 within [0, 100]', async () => {
    const messy = JSON.stringify({
      ...Object.fromEntries(CRITERIA.map((c) => [c, 82])), // → 80
      vocalAccuracy: 83, // → 85
      rhythmTiming: 117, // → clamped 100
      toneQuality: -4, // → clamped 0
      originality: 'not-a-number', // → default 50
    });
    openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: messy } }] });

    const res = await new OpenAIScoringProvider('k').score(INPUT);

    expect(res.breakdown.vocalAccuracy).toBe(85);
    expect(res.breakdown.rhythmTiming).toBe(100);
    expect(res.breakdown.toneQuality).toBe(0);
    expect(res.breakdown.originality).toBe(50);
    for (const c of CRITERIA) expect(res.breakdown[c] % 5).toBe(0);
    expect(res.provisional).toBe(true);
  });

  it('identical model output → identical composed score (pure math downstream)', async () => {
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: RAW_82 } }] });
    const p = new OpenAIScoringProvider('k');
    const a = await p.score(INPUT);
    const b = await p.score(INPUT);
    expect(a.initialAiScore).toBe(b.initialAiScore);
    expect(a.breakdown).toEqual(b.breakdown);
  });

  it('Anthropic reply wrapped in prose still parses (defensive JSON slice)', async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: `Here is the estimate:\n${RAW_82}\nHope this helps!` }],
    });
    const res = await new AnthropicScoringProvider('k').score(INPUT);
    expect(res.breakdown.vocalAccuracy).toBe(80);
  });

  it('falls back to the DETERMINISTIC mock (never hard-fails) on provider error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openaiCreate.mockRejectedValueOnce(new Error('rate limited'));
    const res = await new OpenAIScoringProvider('k').score(INPUT);
    expect(res.model).toBe('mock-provisional-v0');
    expect(res.provisional).toBe(true);

    // The mock itself is deterministic: same input, same score, every time.
    openaiCreate.mockRejectedValueOnce(new Error('rate limited again'));
    const res2 = await new OpenAIScoringProvider('k').score(INPUT);
    expect(res2.initialAiScore).toBe(res.initialAiScore);
  });

  it('provider selection: OpenAI primary, then Gemini, then Anthropic, then mock', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'o');
    vi.stubEnv('GEMINI_API_KEY', 'g');
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    expect(getScoringProvider()).toBeInstanceOf(OpenAIScoringProvider);

    vi.stubEnv('OPENAI_API_KEY', '');
    expect(getScoringProvider()).toBeInstanceOf(GeminiScoringProvider);

    vi.stubEnv('GEMINI_API_KEY', '');
    expect(getScoringProvider()).toBeInstanceOf(AnthropicScoringProvider);

    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const mock = getScoringProvider();
    const res = await mock.score(INPUT);
    expect(res.model).toBe('mock-provisional-v0');
  });

  it('Gemini is called with temperature 0 and JSON-only output, and parses the reply', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: RAW_82 }] } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await new GeminiScoringProvider('k').score(INPUT);

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    const body = JSON.parse(init.body) as {
      generationConfig: { temperature: number; responseMimeType: string };
    };
    expect(url).toContain(':generateContent');
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(res.provider).toBe('gemini');
    expect(res.breakdown.vocalAccuracy).toBe(80); // 82 quantized to 80
    expect(res.provisional).toBe(true);

    vi.unstubAllGlobals();
  });

  it('Gemini degrades to the deterministic mock on HTTP errors (e.g. depleted credits 429)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED' })),
    );

    const res = await new GeminiScoringProvider('k').score(INPUT);

    expect(res.provider).toBe('mock');
    expect(res.model).toBe('mock-provisional-v0');
    vi.unstubAllGlobals();
  });

  it('regime v4: version bumped and rubric is fame-free', async () => {
    const { SCORING_VERSION } = await import('@voxscore/core');
    const { SYSTEM } = await import('./scoring');
    expect(SCORING_VERSION).toBe(4);
    expect(SYSTEM).not.toMatch(/established artist/i);
    expect(SYSTEM).toMatch(/do not reward performer fame/i);
    expect(SYSTEM).toMatch(/multiple of 5/);
  });
});

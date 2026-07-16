import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analysis-signature', () => ({
  verifyAnalyzerCallbackSignature: vi.fn(() => true),
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { AI_JUDGE_MIN_VERIFIED_CONFIDENCE } from '@voxscore/scoring';
import { verifyAnalyzerCallbackSignature } from '@/lib/analysis-signature';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { POST } from './route';

const result = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  pipelineVersion: 1,
  pitchEngine: 'yin',
  pitchEngineVersion: 'voxscore-yin-1',
  audioSha256: 'a'.repeat(64),
  qualityGate: {
    passed: true,
    reason: null,
    signalQualityConfidence: 0.9,
    pitchEngineConfidence: 0.85,
    alignmentConfidence: 0.8,
    referenceCoverage: 0.95,
    referenceQualityConfidence: 1,
  },
  rawMetrics: {
    durationSeconds: 30,
    voicedRatio: 0.8,
    snrDb: 30,
    clippingRate: 0,
    medianCentError: 20,
    rawPitchAccuracy50: 0.9,
    voicingRecall: 0.9,
    voicingFalseAlarm: 0.02,
    onsetF1: 0.85,
    detectedTranspositionSemitones: 0,
  },
  measuredBreakdown: {
    melodyAccuracy: 80,
    rhythmAccuracy: 80,
    pitchControl: 80,
    noteTransitions: 80,
    sustainControl: 80,
    dynamicPhrasing: 80,
  },
};

function request(body: unknown = result): Request {
  return new Request('http://localhost/api/internal/analysis-results', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-voxscore-timestamp': '2000000000',
      'x-voxscore-signature': `sha256=${'b'.repeat(64)}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/analysis-results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAnalyzerCallbackSignature).mockReturnValue(true);
  });

  it('composes the opening score server-side and atomically finalizes it', async () => {
    const rpc = vi.fn(async () => ({ data: 'result-1', error: null }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('finalize_ai_analysis', {
      p_session_id: result.sessionId,
      p_result: result,
      p_ai_score: 80,
      p_confidence: 0.8,
    });
  });

  it('rejects unsigned and malformed Analyzer results before database access', async () => {
    vi.mocked(verifyAnalyzerCallbackSignature).mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(401);

    expect((await POST(request({ ...result, audioSha256: 'bad' }))).status).toBe(422);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('downgrades a sub-threshold overall confidence to a low_confidence rejection', async () => {
    const rpc = vi.fn(async () => ({ data: 'result-3', error: null }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);
    const belowBar = AI_JUDGE_MIN_VERIFIED_CONFIDENCE - 0.01;
    const marginal = {
      ...result,
      qualityGate: { ...result.qualityGate, alignmentConfidence: belowBar },
    };

    expect((await POST(request(marginal))).status).toBe(200);
    const args = (rpc.mock.calls[0] as unknown[])[1] as {
      p_ai_score: number | null;
      p_confidence: number | null;
      p_result: {
        qualityGate: { passed: boolean; reason: string | null };
        measuredBreakdown: unknown;
      };
    };
    expect(args.p_ai_score).toBeNull();
    expect(args.p_confidence).toBeNull();
    expect(args.p_result.qualityGate.passed).toBe(false);
    expect(args.p_result.qualityGate.reason).toBe('low_confidence');
    expect(args.p_result.measuredBreakdown).toEqual(result.measuredBreakdown);
  });

  it('keeps an exactly-threshold overall confidence verified', async () => {
    const rpc = vi.fn(async () => ({ data: 'result-4', error: null }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);
    const atBar = {
      ...result,
      qualityGate: {
        ...result.qualityGate,
        alignmentConfidence: AI_JUDGE_MIN_VERIFIED_CONFIDENCE,
      },
    };

    expect((await POST(request(atBar))).status).toBe(200);
    const args = (rpc.mock.calls[0] as unknown[])[1] as {
      p_confidence: number | null;
      p_result: { qualityGate: { passed: boolean } };
    };
    expect(args.p_confidence).toBe(AI_JUDGE_MIN_VERIFIED_CONFIDENCE);
    expect(args.p_result.qualityGate.passed).toBe(true);
  });

  it('finalizes quality rejection without creating a score', async () => {
    const rpc = vi.fn(async () => ({ data: 'result-2', error: null }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);
    const rejected = {
      ...result,
      qualityGate: { ...result.qualityGate, passed: false, reason: 'too_noisy' },
      measuredBreakdown: null,
    };

    expect((await POST(request(rejected))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'finalize_ai_analysis',
      expect.objectContaining({ p_ai_score: null, p_confidence: null }),
    );
  });
});

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { analyzerResultSchema, type AnalyzerResult } from '@voxscore/core';
import type { Database, Json } from '@voxscore/db';
import {
  analyzeAiJudgeWav,
  validateMelodyReference,
  type MelodyReference,
  type ReferenceNote,
} from '@voxscore/dsp';
import { verifyAnalysisUploadToken } from './auth';
import { deliverCallback } from './callback';

const MAX_WAV_BYTES = 8 * 1024 * 1024;
// v2: confidence curves aligned with the quality gate (snr/voicing/reference
// length) + rubato-tolerant onset window (0.025 → 0.05 normalized).
const PIPELINE_VERSION = 2;
const PITCH_ENGINE = 'yin';
const PITCH_ENGINE_VERSION = 'voxscore-yin-1';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(encoded),
  });
  res.end(encoded);
}

async function readLimitedBody(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_WAV_BYTES) throw new HttpError(413, 'Recording exceeds 8 MB');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > MAX_WAV_BYTES) throw new HttpError(413, 'Recording exceeds 8 MB');
    chunks.push(buffer);
  }
  if (size === 0) throw new HttpError(400, 'Empty WAV body');
  return Buffer.concat(chunks);
}

function bearerToken(req: IncomingMessage): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization?.trim() ?? '');
  return match?.[1]?.trim() || null;
}

function parseReference(notes: Json, durationMs: number): MelodyReference {
  if (!Array.isArray(notes)) throw new HttpError(422, 'Song reference is invalid');
  const parsedNotes: ReferenceNote[] = notes.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpError(422, 'Song reference note is invalid');
    }
    const note = value as Record<string, Json | undefined>;
    return {
      startSeconds: Number(note.startSeconds),
      endSeconds: Number(note.endSeconds),
      midi: Number(note.midi),
      ...(note.velocity === undefined ? {} : { velocity: Number(note.velocity) }),
    };
  });
  const reference = { durationSeconds: durationMs / 1000, notes: parsedNotes };
  try {
    validateMelodyReference(reference);
  } catch {
    throw new HttpError(422, 'Song reference is invalid');
  }
  return reference;
}

function rejectedResult(sessionId: string, audioSha256: string, error: unknown): AnalyzerResult {
  const message = error instanceof Error ? error.message : '';
  const reason = /audible singing|voiced/i.test(message) ? 'low_voicing' : 'invalid_wav';
  return {
    sessionId,
    pipelineVersion: PIPELINE_VERSION,
    pitchEngine: PITCH_ENGINE,
    pitchEngineVersion: PITCH_ENGINE_VERSION,
    audioSha256,
    qualityGate: {
      passed: false,
      reason,
      signalQualityConfidence: 0,
      pitchEngineConfidence: 0,
      alignmentConfidence: 0,
      referenceCoverage: 0,
      referenceQualityConfidence: 0,
    },
    rawMetrics: {
      durationSeconds: 0,
      voicedRatio: 0,
      snrDb: 0,
      clippingRate: 0,
      medianCentError: null,
      rawPitchAccuracy50: null,
      voicingRecall: 0,
      voicingFalseAlarm: 0,
      onsetF1: null,
      detectedTranspositionSemitones: null,
    },
    measuredBreakdown: null,
  };
}

async function analyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('audio/wav')) {
    throw new HttpError(415, 'Content-Type must be audio/wav');
  }
  const uploadSecret = requiredEnv('ANALYZER_UPLOAD_SECRET');
  const token = bearerToken(req);
  const claims = token ? verifyAnalysisUploadToken(token, uploadSecret) : null;
  if (!claims) throw new HttpError(401, 'Invalid or expired upload token');

  const supabase = createClient<Database>(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: session } = await supabase
    .from('analysis_sessions')
    .select(
      'id, user_id, performance_id, reference_id, mode, status, expires_at, upload_nonce_hash, attempt_count',
    )
    .eq('id', claims.sessionId)
    .maybeSingle();
  const nonceHash = createHash('sha256').update(claims.nonce).digest('hex');
  if (
    !session ||
    session.user_id !== claims.userId ||
    session.performance_id !== claims.performanceId ||
    session.upload_nonce_hash !== nonceHash ||
    !['created', 'uploading'].includes(session.status) ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    throw new HttpError(409, 'Analysis session is closed or does not match');
  }
  if (session.mode !== 'song_reference' || !session.reference_id) {
    throw new HttpError(422, 'This Analyzer requires a song reference');
  }

  const { data: referenceRow } = await supabase
    .from('song_references')
    .select('notes, duration_ms, status')
    .eq('id', session.reference_id)
    .maybeSingle();
  if (!referenceRow || referenceRow.status !== 'ready') {
    throw new HttpError(409, 'Song reference is not ready');
  }
  const reference = parseReference(referenceRow.notes, referenceRow.duration_ms);

  let body: Buffer;
  try {
    body = await readLimitedBody(req);
  } catch (error) {
    await supabase
      .from('analysis_sessions')
      .update({ status: 'failed', error_code: 'invalid_upload' })
      .eq('id', session.id)
      .in('status', ['created', 'uploading']);
    throw error;
  }
  const audioSha256 = createHash('sha256').update(body).digest('hex');

  const { error: processingError } = await supabase
    .from('analysis_sessions')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      attempt_count: session.attempt_count + 1,
    })
    .eq('id', session.id)
    .in('status', ['created', 'uploading']);
  if (processingError) {
    body.fill(0);
    throw new HttpError(500, 'Could not start analysis');
  }
  let result: AnalyzerResult;
  try {
    const measurement = analyzeAiJudgeWav(body, reference);
    result = analyzerResultSchema.parse({
      sessionId: session.id,
      pipelineVersion: PIPELINE_VERSION,
      pitchEngine: PITCH_ENGINE,
      pitchEngineVersion: PITCH_ENGINE_VERSION,
      audioSha256,
      ...measurement,
    });
  } catch (error) {
    result = rejectedResult(session.id, audioSha256, error);
  } finally {
    body.fill(0);
  }

  try {
    await deliverCallback(
      result,
      requiredEnv('ANALYZER_CALLBACK_URL'),
      requiredEnv('ANALYZER_CALLBACK_SECRET'),
    );
  } catch (error) {
    await supabase
      .from('analysis_sessions')
      .update({ status: 'failed', error_code: 'callback_failed' })
      .eq('id', session.id)
      .eq('status', 'processing');
    throw error;
  }
  json(res, 200, { ok: true, audioStored: false, qualityGate: result.qualityGate });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/readyz')) {
      json(res, 200, { ok: true, pipelineVersion: PIPELINE_VERSION });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/analyze') {
      throw new HttpError(404, 'Not found');
    }
    await analyze(req, res);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Analyzer failed';
    if (status >= 500) console.error('[analyzer] request failed', error);
    json(res, status, { error: message });
  }
});

const port = Number(process.env.PORT ?? 8081);
server.listen(port, '0.0.0.0', () => {
  console.log(`[analyzer] listening on ${port}`);
});

import { criteriaOverall } from '@voxscore/core';
import { CRITERIA, type Criterion } from '@voxscore/scoring';

/** Criterion (camelCase) → criteria_ratings column (snake_case). */
export const COLUMN: Record<Criterion, string> = {
  vocalAccuracy: 'vocal_accuracy',
  rhythmTiming: 'rhythm_timing',
  toneQuality: 'tone_quality',
  emotionInterpretation: 'emotion_interpretation',
  technicalSkill: 'technical_skill',
  pronunciationDiction: 'pronunciation_diction',
  recordingQuality: 'recording_quality',
  originality: 'originality',
  stagePresence: 'stage_presence',
};

/** One criteria_ratings row → the voter's 0-100 overall (null if empty). */
export function rowToOverall(row: unknown): number | null {
  const r = row as Record<string, unknown>;
  const ratings: Partial<Record<Criterion, number>> = {};
  for (const c of CRITERIA) {
    const v = r[COLUMN[c]];
    if (typeof v === 'number') ratings[c] = v;
  }
  return criteriaOverall(ratings);
}

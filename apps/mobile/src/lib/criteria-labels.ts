import { useTranslation } from 'react-i18next';

import type { AiJudgeCriterion, Criterion } from '@voxscore/scoring';

/**
 * English fallback labels for the 9 scoring criteria (mirrors the web app).
 * Prefer `useCriterionLabels()` in new code — this static export exists only
 * for callers that can't use hooks.
 */
export const CRITERION_LABELS: Record<Criterion, string> = {
  vocalAccuracy: 'Vocal accuracy',
  rhythmTiming: 'Rhythm & timing',
  toneQuality: 'Tone quality',
  emotionInterpretation: 'Emotion & interpretation',
  technicalSkill: 'Technical skill',
  pronunciationDiction: 'Pronunciation & diction',
  recordingQuality: 'Recording quality',
  originality: 'Originality',
  stagePresence: 'Stage presence',
};

/**
 * Translated display labels for the 6 DSP-measured AI Judge metrics — shown
 * instead of the 9 estimate criteria once a performance is ai_verified.
 */
export function useAiJudgeCriterionLabels(): Record<AiJudgeCriterion, string> {
  const { t } = useTranslation();
  return {
    melodyAccuracy: t('AiJudgeCriteria.melodyAccuracy'),
    rhythmAccuracy: t('AiJudgeCriteria.rhythmAccuracy'),
    pitchControl: t('AiJudgeCriteria.pitchControl'),
    noteTransitions: t('AiJudgeCriteria.noteTransitions'),
    sustainControl: t('AiJudgeCriteria.sustainControl'),
    dynamicPhrasing: t('AiJudgeCriteria.dynamicPhrasing'),
  };
}

/** Translated display labels for the 9 scoring criteria. */
export function useCriterionLabels(): Record<Criterion, string> {
  const { t } = useTranslation();
  return {
    vocalAccuracy: t('Criteria.vocalAccuracy'),
    rhythmTiming: t('Criteria.rhythmTiming'),
    toneQuality: t('Criteria.toneQuality'),
    emotionInterpretation: t('Criteria.emotionInterpretation'),
    technicalSkill: t('Criteria.technicalSkill'),
    pronunciationDiction: t('Criteria.pronunciationDiction'),
    recordingQuality: t('Criteria.recordingQuality'),
    originality: t('Criteria.originality'),
    stagePresence: t('Criteria.stagePresence'),
  };
}

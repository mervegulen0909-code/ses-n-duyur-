import type { Criterion } from '@vocal-league/scoring';

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

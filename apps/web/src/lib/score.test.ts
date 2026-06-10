import { describe, expect, it } from 'vitest';
import { toScoreView } from './score';

describe('toScoreView', () => {
  it('passes through a real score row', () => {
    expect(toScoreView({ current_score: 82.5, is_provisional: false })).toEqual({
      currentScore: 82.5,
      isProvisional: false,
    });
  });

  it('defaults a missing row to provisional with no score', () => {
    expect(toScoreView(undefined)).toEqual({ currentScore: null, isProvisional: true });
  });

  it('keeps a provisional flag and a present score together', () => {
    expect(toScoreView({ current_score: 64, is_provisional: true })).toEqual({
      currentScore: 64,
      isProvisional: true,
    });
  });

  it('treats a null is_provisional as provisional', () => {
    expect(toScoreView({ current_score: 70, is_provisional: null }).isProvisional).toBe(true);
  });
});

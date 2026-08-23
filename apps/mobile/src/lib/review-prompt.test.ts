import { describe, expect, it } from 'vitest';
import { nextReviewState, parseReviewState, REVIEW_ASK_THRESHOLD } from './review-prompt';

const NOW = '2026-08-23T12:00:00.000Z';

describe('parseReviewState', () => {
  it('starts fresh on missing or corrupt storage', () => {
    expect(parseReviewState(null)).toEqual({ successes: 0, askedAt: null });
    expect(parseReviewState('not json')).toEqual({ successes: 0, askedAt: null });
    expect(parseReviewState('{"successes":"two"}')).toEqual({ successes: 0, askedAt: null });
  });

  it('round-trips a persisted state', () => {
    const state = { successes: 3, askedAt: NOW };
    expect(parseReviewState(JSON.stringify(state))).toEqual(state);
  });
});

describe('nextReviewState', () => {
  it('does not ask on the first success', () => {
    const { ask, state } = nextReviewState({ successes: 0, askedAt: null }, NOW);
    expect(ask).toBe(false);
    expect(state).toEqual({ successes: 1, askedAt: null });
  });

  it(`asks exactly at success #${REVIEW_ASK_THRESHOLD} and stamps askedAt`, () => {
    const { ask, state } = nextReviewState(
      { successes: REVIEW_ASK_THRESHOLD - 1, askedAt: null },
      NOW,
    );
    expect(ask).toBe(true);
    expect(state).toEqual({ successes: REVIEW_ASK_THRESHOLD, askedAt: NOW });
  });

  it('never asks again once askedAt is set', () => {
    const asked = { successes: 10, askedAt: NOW };
    const { ask, state } = nextReviewState(asked, '2026-12-01T00:00:00.000Z');
    expect(ask).toBe(false);
    expect(state.askedAt).toBe(NOW);
    expect(state.successes).toBe(11);
  });
});

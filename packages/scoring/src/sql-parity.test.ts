import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FULL_COMMUNITY_VOTES } from './ai-judge';
import { DEFAULT_CRITERION_WEIGHTS } from './criteria';
import {
  BLEND_PRIOR_STRENGTH,
  LISTENER_WEIGHT_CAP,
  PROVISIONAL_CAP_RELAX_MAX,
  PROVISIONAL_CAP_RELAX_RANGE,
  PROVISIONAL_CAP_RELAX_START,
} from './weights';

// The SQL RPC re-implements the blend for atomicity; this guard keeps the two
// implementations from ever drifting apart silently. When the regime changes,
// point this at the NEWEST recompute migration.
// Normalize CRLF -> LF: migrations are plain text and git's autocrlf may check
// them out with CRLF on Windows, which would break any multi-line `\n`-embedded
// assertion below even though the SQL content itself is unaffected.
const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../../supabase/migrations/20260717120000_scoring_fairness_hardening.sql',
      import.meta.url,
    ),
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('SQL RPC mirrors the TS scoring constants (RPC v7)', () => {
  it('embeds every criterion weight literal', () => {
    for (const [criterion, w] of Object.entries(DEFAULT_CRITERION_WEIGHTS)) {
      const col = criterion.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      expect(SQL, `${criterion} weight`).toContain(`${w.toFixed(2)}*${col}`);
    }
  });

  it('embeds the smooth-blend constants with the scale-relaxed provisional cap', () => {
    expect(SQL).toContain(`(v_vote_count + ${BLEND_PRIOR_STRENGTH}.0)`);
    expect(SQL).toContain(
      `least(${LISTENER_WEIGHT_CAP} + ${PROVISIONAL_CAP_RELAX_MAX.toFixed(2)} * least(1.0, ` +
        `greatest(0, v_vote_count - ${PROVISIONAL_CAP_RELAX_START}) / ${PROVISIONAL_CAP_RELAX_RANGE}.0)`,
    );
  });

  it('winsorizes small samples to median ± 25 below the trim threshold', () => {
    expect(SQL).toContain('when c.n < 10');
    expect(SQL).toContain('greatest(c.med - 25, least(c.med + 25, pv.overall))');
  });

  it('ramps new-voter weight with proven listening history (sybil warm-up)', () => {
    expect(SQL).toContain('0.4 + 0.06 * v_prior_listens');
  });

  it('allows revising a vote for 24 hours, then locks it', () => {
    expect(SQL).toContain('on conflict (voter_id, performance_id) do update');
    expect(SQL).toContain("interval '24 hours'");
    expect(SQL).toContain('vote_locked');
  });

  it('hands AI-verified scores fully to the community at the configured vote count', () => {
    expect(SQL).toContain(`v_vote_count / ${FULL_COMMUNITY_VOTES}.0`);
    expect(SQL).toContain(`when v_vote_count >= ${FULL_COMMUNITY_VOTES} then 'community'`);
  });

  it('aggregates with the per-rating trust weight', () => {
    expect(SQL).toContain('sum(weight * overall)');
    expect(SQL).toContain('nullif(sum(weight) filter');
  });

  it('trims the top and bottom 10% only at n >= 10 (T10)', () => {
    expect(SQL).toContain('where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))');
  });

  it('stores the per-vote overall stddev for the confidence interval (T11)', () => {
    expect(SQL).toContain('stddev_samp(overall)');
    expect(SQL).toContain('listener_stddev = v_listener_stddev');
  });

  it('ranks with a total-order tiebreaker so ties trim deterministically', () => {
    expect(SQL).toContain('row_number() over (order by overall, weight, id)');
  });

  it('sizes the stddev over the SAME trimmed set as the mean', () => {
    // The stddev must carry the trim filter, not annotate the full sample.
    expect(SQL).toContain(
      'stddev_samp(overall) filter (\n      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))',
    );
  });
});

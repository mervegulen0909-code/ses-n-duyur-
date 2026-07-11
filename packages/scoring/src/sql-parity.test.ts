import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERION_WEIGHTS } from './criteria';
import { BLEND_PRIOR_STRENGTH, LISTENER_WEIGHT_CAP } from './weights';

// The SQL RPC re-implements the blend for atomicity; this guard keeps the two
// implementations from ever drifting apart silently. When the regime changes,
// point this at the NEWEST recompute migration.
const SQL = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20260712090000_score_regime_v4.sql', import.meta.url),
  ),
  'utf8',
);

describe('SQL RPC mirrors the TS scoring constants (regime v4)', () => {
  it('embeds every criterion weight literal', () => {
    for (const [criterion, w] of Object.entries(DEFAULT_CRITERION_WEIGHTS)) {
      const col = criterion.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      expect(SQL, `${criterion} weight`).toContain(`${w.toFixed(2)}*${col}`);
    }
  });

  it('embeds the smooth-blend constants', () => {
    expect(SQL).toContain(`(v_vote_count + ${BLEND_PRIOR_STRENGTH}.0)`);
    expect(SQL).toContain(`least(${LISTENER_WEIGHT_CAP}, `);
  });

  it('aggregates with the per-rating trust weight', () => {
    expect(SQL).toContain('sum(weight * (');
    expect(SQL).toContain('nullif(sum(weight), 0)');
  });
});

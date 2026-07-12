import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { weightFromReputation } from './reputation';

// The DB trigger guard_criteria_rating_weight() re-derives criteria_ratings.weight
// from profiles.reputation for end-user writes, so a client can never forge its
// own weight. Its SQL formula MUST match weightFromReputation — this guard ties
// the SQL literals to the TS function's actual outputs so they can't drift.
const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../supabase/migrations/20260712150000_criteria_weight_guard.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('guard_criteria_rating_weight() mirrors weightFromReputation', () => {
  it('bounds the DB write to [0, 1.5] with a CHECK constraint', () => {
    expect(SQL).toContain('check (weight >= 0 and weight <= 1.5)');
  });

  it('overwrites weight only for end-user (auth.uid() non-null) writes', () => {
    expect(SQL).toContain('if auth.uid() is not null then');
    expect(SQL).toContain('new.weight :=');
  });

  it('null/0 reputation maps to full weight 1 in both TS and SQL', () => {
    expect(SQL).toContain('when v_rep is null or v_rep = 0 then 1');
    expect(weightFromReputation(0)).toBe(1);
  });

  it('SQL clamp literals equal the TS function outputs (no drift)', () => {
    const m = SQL.match(/least\(([\d.]+),\s*greatest\(([\d.]+),\s*v_rep \/ ([\d.]+)\)\)/);
    expect(m).not.toBeNull();
    const [, hi, lo, scale] = m as RegExpMatchArray;
    // Upper clamp == TS max weight (reputation far above the range).
    expect(Number(hi)).toBe(weightFromReputation(1_000_000));
    // Lower clamp == TS min weight (a tiny positive reputation).
    expect(Number(lo)).toBe(weightFromReputation(1));
    // Scale: reputation == scale → weight exactly 1.0.
    expect(weightFromReputation(Number(scale))).toBe(1);
  });
});

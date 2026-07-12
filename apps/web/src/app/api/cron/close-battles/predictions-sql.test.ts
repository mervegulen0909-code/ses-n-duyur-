import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// score_battle_predictions() runs SECURITY DEFINER (it BYPASSES RLS) and is
// called ONLY by this cron via the service-role client. This guard pins the
// migration's security-critical clauses (mirrors criteria-weight-parity.test.ts
// and packages/scoring/src/sql-parity.test.ts) so they can't silently regress.
// Normalize CRLF -> LF: git's autocrlf may check migrations out with CRLF on
// Windows, which would break multi-line assertions.
const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../../../supabase/migrations/20260713110000_battle_predictions.sql',
      import.meta.url,
    ),
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('battle_predictions migration — security-critical clauses', () => {
  it('enables RLS on the new table', () => {
    expect(SQL).toContain('alter table public.battle_predictions enable row level security');
  });

  it('insert policy binds own-row + open battle + one of the two fighters', () => {
    expect(SQL).toContain('user_id = auth.uid()');
    expect(SQL).toContain("b.status = 'open'");
    expect(SQL).toContain('predicted in (b.perf_a, b.perf_b)');
  });

  it('one prediction per user per battle', () => {
    expect(SQL).toContain('unique (battle_id, user_id)');
  });

  it('revokes RPC execute from client roles; service_role only', () => {
    expect(SQL).toContain(
      'revoke execute on function public.score_battle_predictions(uuid, uuid) from public, anon, authenticated',
    );
    expect(SQL).toContain(
      'grant execute on function public.score_battle_predictions(uuid, uuid) to service_role',
    );
  });

  it('settles each prediction exactly once (idempotent re-run, +10 per correct pick)', () => {
    // Only never-settled rows flip, and points are credited FROM those same
    // returned rows — a cron retry can never double-award.
    expect(SQL).toContain('where battle_id = p_battle_id and is_correct is null');
    expect(SQL).toContain('returning user_id, is_correct');
    expect(SQL).toContain('prediction_points + 10');
  });

  it('locks prediction_points as a server-managed profile column', () => {
    expect(SQL).toContain('new.prediction_points is distinct from old.prediction_points');
  });
});

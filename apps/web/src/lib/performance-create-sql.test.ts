import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  new URL(
    '../../../../supabase/migrations/20260717090000_restore_provisional_scores.sql',
    import.meta.url,
  ),
  'utf8',
).replaceAll('\r\n', '\n');

describe('create_scored_performance_atomic score initialization', () => {
  it('creates new entries with a clearly-labeled provisional estimate', () => {
    expect(SQL).toContain('score_status, score_source');
    expect(SQL).toContain("then 'unscored' else 'provisional_estimate'");
    expect(SQL).toContain("then 'none' else 'metadata_estimate'");
  });

  it('opens the displayed score at the provisional estimate with a flat trend', () => {
    expect(SQL).toContain(
      'null, p_initial_ai_score, case when p_initial_ai_score is null then null else 0 end, 0',
    );
  });
});

describe('finalize_ai_analysis rejection safety', () => {
  it('only downgrades to quality_rejected when no score exists yet', () => {
    const rejectedBranch = SQL.slice(SQL.indexOf("set score_status = 'quality_rejected'"));
    expect(rejectedBranch).toContain('and initial_ai_score is null');
  });
});

describe('expire_stale_analysis_sessions', () => {
  it('releases a stuck analysis_pending score back to its true state', () => {
    expect(SQL).toContain('create or replace function public.expire_stale_analysis_sessions');
    expect(SQL).toContain("s.score_status = 'analysis_pending'");
    expect(SQL).toContain("when s.initial_ai_score is null then 'unscored'");
    expect(SQL).toContain("when s.is_provisional then 'provisional_estimate'");
    expect(SQL).toContain("else 'ai_verified'");
  });

  it('is service-role only', () => {
    expect(SQL).toContain('revoke execute on function public.expire_stale_analysis_sessions(uuid)');
    expect(SQL).toContain('grant execute on function public.expire_stale_analysis_sessions(uuid)');
  });
});

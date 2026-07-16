import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  new URL(
    '../../../../supabase/migrations/20260716100000_ai_judge_unscored_create.sql',
    import.meta.url,
  ),
  'utf8',
).replaceAll('\r\n', '\n');

describe('create_scored_performance_atomic score initialization', () => {
  it('creates new catalog entries as unscored until AI Judge finishes', () => {
    expect(SQL).toContain('score_status, score_source');
    expect(SQL).toContain("then 'unscored' else 'legacy_metadata'");
    expect(SQL).toContain("then 'none' else 'metadata_estimate'");
  });

  it('leaves the displayed score null when no verified AI score exists', () => {
    expect(SQL).toContain(
      'null, p_initial_ai_score, case when p_initial_ai_score is null then null else 0 end, 0',
    );
  });
});

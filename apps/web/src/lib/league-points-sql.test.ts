import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  new URL(
    '../../../../supabase/migrations/20260713121000_cohort_league_points.sql',
    import.meta.url,
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('cohort league point SQL', () => {
  it('keeps the event ledger service-only behind RLS', () => {
    expect(SQL).toContain('create table public.league_point_events');
    expect(SQL).toContain('alter table public.league_point_events enable row level security;');
    expect(SQL).not.toMatch(/create policy .*league_point_events/);
  });

  it('awards each source event once in the same SQL statement as the increment', () => {
    expect(SQL).toContain('create or replace function public.award_league_points');
    expect(SQL).toContain('on conflict (source_kind, source_id) do nothing');
    expect(SQL).toContain('from awarded');
  });

  it('exposes both point RPCs only to the service role', () => {
    expect(SQL).toContain(
      'revoke execute on function public.add_league_points(uuid, date, integer)\n  from public, anon, authenticated;',
    );
    expect(SQL).toContain(
      'revoke execute on function public.award_league_points(uuid, date, integer, text, text)\n  from public, anon, authenticated;',
    );
    expect(SQL).toContain(
      'grant execute on function public.award_league_points(uuid, date, integer, text, text) to service_role;',
    );
  });
});

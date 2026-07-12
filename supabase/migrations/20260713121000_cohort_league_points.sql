-- Cohort-league point accrual. This is intentionally separate from
-- 20260713120000_cohort_leagues.sql because that migration may already be
-- applied when the API call sites ship.

-- Every real product event is awarded at most once. This ledger is
-- service-only (RLS enabled, no client policies) and makes retries/concurrent
-- requests harmless for league standings.
create table public.league_point_events (
  source_kind text not null check (source_kind in ('verified_listen', 'battle_vote', 'battle_win')),
  source_id   text not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  week_start  date not null,
  delta       integer not null check (delta > 0),
  created_at  timestamptz not null default now(),
  primary key (source_kind, source_id)
);
alter table public.league_point_events enable row level security;
-- No user policies: only the service-role RPC below can write/read the ledger.

-- Plan-compatible primitive. A no-op when the user has no membership for the
-- supplied week (for example, an active user who joined mid-week).
create or replace function public.add_league_points(
  p_user_id uuid, p_week_start date, p_delta integer
) returns void language sql security definer set search_path = public as $$
  update public.league_memberships
    set points = points + p_delta
    where user_id = p_user_id and week_start = p_week_start;
$$;

-- Retry-safe award used by every production call site. The insert and update
-- are one SQL statement/transaction: only the request that inserts the source
-- event can increment the membership.
create or replace function public.award_league_points(
  p_user_id uuid,
  p_week_start date,
  p_delta integer,
  p_source_kind text,
  p_source_id text
) returns void language sql security definer set search_path = public as $$
  with awarded as (
    insert into public.league_point_events (
      source_kind, source_id, user_id, week_start, delta
    ) values (
      p_source_kind, p_source_id, p_user_id, p_week_start, p_delta
    )
    on conflict (source_kind, source_id) do nothing
    returning user_id, week_start, delta
  )
  update public.league_memberships lm
    set points = lm.points + awarded.delta
    from awarded
    where lm.user_id = awarded.user_id
      and lm.week_start = awarded.week_start;
$$;

revoke execute on function public.add_league_points(uuid, date, integer)
  from public, anon, authenticated;
revoke execute on function public.award_league_points(uuid, date, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.add_league_points(uuid, date, integer) to service_role;
grant execute on function public.award_league_points(uuid, date, integer, text, text) to service_role;

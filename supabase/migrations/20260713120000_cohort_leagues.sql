-- 20260713120000_cohort_leagues.sql
-- Weekly 30-person leagues with promotion/relegation (Duolingo model).
-- tier 0 = Bronze, 1 = Silver, 2 = Gold, 3 = Diamond.
create table public.league_cohorts (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null,
  tier       integer not null default 0 check (tier between 0 and 3),
  created_at timestamptz not null default now()
);
create table public.league_memberships (
  cohort_id  uuid not null references public.league_cohorts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  points     integer not null default 0,
  primary key (cohort_id, user_id),
  unique (user_id, week_start)
);
alter table public.profiles add column league_tier integer not null default 0;
alter table public.league_cohorts enable row level security;
alter table public.league_memberships enable row level security;
create policy league_cohorts_select_all on public.league_cohorts for select using (true);
create policy league_memberships_select_all on public.league_memberships for select using (true);
-- All writes are service-role (cron + point accrual). No user policies.
create index league_memberships_week_idx on public.league_memberships (week_start, user_id);

-- profiles.league_tier is SERVER-managed (the weekly rotation cron promotes/
-- relegates it). Without guarding it, profiles_update_self (init.sql) would let
-- any user set their own tier to Diamond via PostgREST. Same posture as
-- role/reputation/prediction_points — extend the existing privilege guard so
-- service_role / migrations (no auth.uid()) stay free to manage the column.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.role is distinct from old.role
          or new.reputation is distinct from old.reputation
          or new.prediction_points is distinct from old.prediction_points
          or new.league_tier is distinct from old.league_tier) then
    raise exception 'profiles.role, reputation, prediction_points and league_tier are server-managed';
  end if;
  return new;
end;
$$;

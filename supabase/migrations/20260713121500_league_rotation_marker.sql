-- A successful prior-week promotion/relegation pass is applied once per new
-- league week. If a run fails before this marker is written, retrying is safe:
-- the route writes absolute targets derived from the prior cohort tier.
create table public.league_rotation_weeks (
  week_start            date primary key,
  movement_completed_at timestamptz not null default now()
);
alter table public.league_rotation_weeks enable row level security;
-- No user policies: only the service-role rotation cron owns these markers.

-- Seasons (growth §4.9/7 — design in docs/growth-features-plan.md). A season
-- boundary is a PARTITION MARKER, not a reset — Elo/score history is never
-- deleted. scripts/reset-league-data.sql remains the only way to actually
-- clear data, and only with explicit user consent.

create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.seasons enable row level security;
create policy seasons_select_all on public.seasons for select using (true);
-- Insert/update: service role only, via the admin API (POST
-- /api/admin/seasons) — no user policy, mirrors featured_challenges.

-- Nullable + on delete set null: a season can be deleted (rare, admin
-- mistake correction) without cascading into score/battle history. New rows
-- get the CURRENT open season's id at write time (server-side, from
-- currentSeasonId() in apps/web/src/lib/seasons.ts), never client-supplied.
alter table public.scores add column season_id uuid references public.seasons (id) on delete set null;
alter table public.battles add column season_id uuid references public.seasons (id) on delete set null;
create index scores_season_idx on public.scores (season_id);
create index battles_season_idx on public.battles (season_id);

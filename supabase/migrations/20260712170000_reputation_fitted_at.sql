-- Scoring hardening (HIGH): make the nightly reputation refit a round-robin.
--
-- The refresh-reputation cron sorted eligible voters by id and took the first
-- 200 every night, so once >200 voters were eligible the tail was NEVER refit
-- (the "self-heals next run" comment was false — the sort key never advanced).
-- Track when each voter was last refit and drain oldest-first so every voter is
-- reached over successive nights.
alter table public.profiles add column reputation_fitted_at timestamptz;

-- Oldest-first (never-fitted first) is the batch order the cron selects on.
create index profiles_reputation_fitted_at_idx
  on public.profiles (reputation_fitted_at nulls first, id);

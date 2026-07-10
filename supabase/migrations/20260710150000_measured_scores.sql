-- Measured vocal scores — ADR 0003 "measure and delete".
--
-- One row per performance, holding the DSP features and 0-100 sub-scores
-- measured from the performer's OWN submitted recording (Hard Rule 3).
-- The audio itself is NEVER stored anywhere: the API analyzes the uploaded
-- bytes in memory and discards them; only this row persists.
--
-- Written ONLY by service_role (no user-facing insert/update/delete
-- policies), publicly readable like public.scores.

create table if not exists public.measured_scores (
  id                 uuid primary key default gen_random_uuid(),
  performance_id     uuid not null unique references public.performances (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  dsp_version        integer not null default 1,
  features           jsonb not null,
  measured_breakdown jsonb not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.measured_scores enable row level security;

drop policy if exists measured_scores_select_all on public.measured_scores;
create policy measured_scores_select_all
  on public.measured_scores for select
  using (true);

drop trigger if exists measured_scores_set_updated_at on public.measured_scores;
create trigger measured_scores_set_updated_at
  before update on public.measured_scores
  for each row execute function public.set_updated_at();

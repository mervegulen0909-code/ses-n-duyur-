-- Scoring hardening (CRITICAL): server-manage `criteria_ratings.weight`.
--
-- The API stamps the voter's reputation-derived trust weight, but it does so
-- with the USER's client (RLS), and the insert policy never constrained the
-- `weight` column — so an authenticated user could bypass /api/votes and POST
-- straight to PostgREST with `weight: 999.999`, and the RPC's
-- sum(weight*overall)/sum(weight) let that single row hijack listener_score
-- (fully, on the many performances with <10 votes where no trim applies).
--
-- Fix mirrors guard_profile_privileges (role/reputation): a BEFORE INSERT/UPDATE
-- trigger overwrites `weight` with a SERVER-derived value for end-user writes
-- (auth.uid() non-null), so the client can never choose its own weight. The
-- formula MUST match packages/scoring/src/weights? no — reputation.ts
-- weightFromReputation (guarded by criteria-weight-parity.test.ts). A CHECK adds
-- defense-in-depth for any service-role/backfill path.

alter table public.criteria_ratings
  add constraint criteria_ratings_weight_range check (weight >= 0 and weight <= 1.5);

create or replace function public.guard_criteria_rating_weight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep integer;
begin
  -- End-user writes (JWT sub present) may not choose their own weight; derive it
  -- from the voter's server-managed reputation. Service role / migrations
  -- (auth.uid() is null) set weight explicitly and are trusted.
  if auth.uid() is not null then
    select reputation into v_rep from public.profiles where id = new.voter_id;
    -- Mirrors weightFromReputation: null/0 (no history) -> 1; else clamp to
    -- [0.5, 1.5]. A negative (corrupt) reputation floors to 0.5, never 1.
    new.weight := case
      when v_rep is null or v_rep = 0 then 1
      else least(1.5, greatest(0.5, v_rep / 1000.0))
    end;
  end if;
  return new;
end;
$$;

create trigger criteria_ratings_guard_weight
  before insert or update on public.criteria_ratings
  for each row execute function public.guard_criteria_rating_weight();

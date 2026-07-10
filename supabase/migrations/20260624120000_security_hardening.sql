-- VoxScore — security & integrity hardening (E2E audit follow-up)
-- Closes four DB-layer gaps surfaced by the principal-engineer audit:
--   1. profiles.role / profiles.reputation privilege escalation (any user could
--      self-promote to admin via the RLS-scoped UPDATE policy).
--   2. battle_votes RLS did not bind the two listens / winner to the battle's
--      performances (Hard Rule 5 was app-enforced only, not DB-enforced).
--   3. Missing indexes on the two hottest per-performance read paths.
--   4. Non-atomic Elo read-modify-write → lost updates under concurrency.

-- ----------------------------------------------------------------------------
-- 1. Lock down privileged profile columns.
--    role/reputation are SERVER-managed. The profiles_update_self policy only
--    constrains the ROW (id = auth.uid()), not which COLUMNS change, so a user
--    could `update profiles set role='admin' where id = auth.uid()`. RLS cannot
--    see OLD, so a BEFORE UPDATE trigger is the robust guard. End-user requests
--    carry a JWT sub (auth.uid() is non-null); service_role / SQL migrations do
--    not (auth.uid() is null) and remain free to manage these columns.
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.role is distinct from old.role
          or new.reputation is distinct from old.reputation) then
    raise exception 'profiles.role and profiles.reputation are server-managed';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ----------------------------------------------------------------------------
-- 2. Bind battle_votes to the battle at the DB layer (mirror criteria_ratings).
--    The WITH CHECK must prove: both listens are valid + owned by the voter AND
--    cover the two SIDES of THIS battle, and the winner is one of the two.
-- ----------------------------------------------------------------------------
drop policy if exists battle_votes_insert_verified on public.battle_votes;
create policy battle_votes_insert_verified on public.battle_votes
  for insert with check (
    voter_id = auth.uid()
    and exists (
      select 1
      from public.battles b
      join public.verified_listens la on la.id = listen_a_id
      join public.verified_listens lb on lb.id = listen_b_id
      where b.id = battle_id
        and la.user_id = auth.uid() and la.is_valid = true and la.performance_id = b.perf_a
        and lb.user_id = auth.uid() and lb.is_valid = true and lb.performance_id = b.perf_b
        and winner_performance_id in (b.perf_a, b.perf_b)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Indexes for the hot per-performance read paths.
--    The composite unique(voter_id, performance_id) cannot serve a
--    performance_id-only lookup; the score recompute filters on performance_id
--    on every vote. Comments are fetched per performance, newest first.
-- ----------------------------------------------------------------------------
create index if not exists criteria_ratings_perf_idx
  on public.criteria_ratings (performance_id);
create index if not exists comments_perf_created_idx
  on public.comments (performance_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. Atomic battle-result application. Locks BOTH performance rows, computes the
--    logistic Elo update (mirrors packages/scoring/src/elo.ts) and applies it
--    with atomic counter increments — eliminating the JS read-modify-write race
--    that lost Elo points and undercounted battles under concurrency.
-- ----------------------------------------------------------------------------
create or replace function public.apply_battle_result(
  p_perf_a uuid,
  p_perf_b uuid,
  p_result_for_a numeric,
  p_k numeric default 32
)
returns table (rating_a numeric, rating_b numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_a numeric;
  cur_b numeric;
  exp_a numeric;
  new_a numeric;
  new_b numeric;
begin
  -- Lock both rows in a deterministic order (by id) to avoid deadlocks.
  select elo_rating into cur_a from public.performances where id = p_perf_a for update;
  select elo_rating into cur_b from public.performances where id = p_perf_b for update;
  if cur_a is null or cur_b is null then
    raise exception 'performance not found';
  end if;

  exp_a := 1.0 / (1.0 + power(10.0, (cur_b - cur_a) / 400.0));
  new_a := cur_a + p_k * (p_result_for_a - exp_a);
  new_b := cur_b + p_k * ((1.0 - p_result_for_a) - (1.0 - exp_a));

  update public.performances
     set elo_rating = new_a,
         battle_count = battle_count + 1,
         battle_wins = battle_wins + (case when p_result_for_a = 1 then 1 else 0 end)
   where id = p_perf_a;

  update public.performances
     set elo_rating = new_b,
         battle_count = battle_count + 1,
         battle_wins = battle_wins + (case when p_result_for_a = 0 then 1 else 0 end)
   where id = p_perf_b;

  rating_a := new_a;
  rating_b := new_b;
  return next;
end;
$$;

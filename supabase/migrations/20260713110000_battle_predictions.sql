-- Prediction pools: listeners pick a winner BEFORE a battle closes. This is
-- a game layer — completely separate from battle_votes (hard rules 4/5):
-- no listen gate, no Elo/score impact, its own table and its own points.
create table public.battle_predictions (
  id           uuid primary key default gen_random_uuid(),
  battle_id    uuid not null references public.battles (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  predicted    uuid not null references public.performances (id) on delete cascade,
  is_correct   boolean,
  created_at   timestamptz not null default now(),
  unique (battle_id, user_id)
);
alter table public.battle_predictions enable row level security;

-- Insert your own prediction, only while the battle is still open, and only
-- for one of the two fighters.
create policy battle_predictions_insert_own on public.battle_predictions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.battles b
      where b.id = battle_id
        and b.status = 'open'
        and predicted in (b.perf_a, b.perf_b)
    )
  );
create policy battle_predictions_select_own on public.battle_predictions
  for select using (user_id = auth.uid());
-- No user update/delete: predictions are commitments. Scoring is service-role.

alter table public.profiles add column prediction_points integer not null default 0;

-- prediction_points is SERVER-managed (the scoring RPC below). Without this,
-- profiles_update_self (init.sql) would let any user set their own points via
-- PostgREST. Same trigger posture as role/reputation
-- (20260624120000_security_hardening.sql) — service_role / migrations carry no
-- auth.uid() and stay free to manage the column.
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
          or new.prediction_points is distinct from old.prediction_points) then
    raise exception 'profiles.role, reputation and prediction_points are server-managed';
  end if;
  return new;
end;
$$;

-- Called by the close-battles cron (service role) once per closed battle.
-- Single statement = atomic; the `is_correct is null` filter + crediting only
-- the rows RETURNED by that same flip makes a cron retry idempotent (each
-- prediction settles exactly once, +10 is never double-awarded).
create or replace function public.score_battle_predictions(
  p_battle_id uuid,
  p_winner uuid
) returns void
language sql
security definer
set search_path = public
as $$
  with settled as (
    update public.battle_predictions
      set is_correct = (predicted = p_winner)
      where battle_id = p_battle_id and is_correct is null
      returning user_id, is_correct
  )
  update public.profiles pr
    set prediction_points = pr.prediction_points + 10
    from settled s
    where s.is_correct
      and s.user_id = pr.id;
$$;
revoke execute on function public.score_battle_predictions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.score_battle_predictions(uuid, uuid) to service_role;

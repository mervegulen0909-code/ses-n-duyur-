-- One Elo update per battle (applied at close by the close-battles cron),
-- not one per vote. Also fixes win counting for fractional (margin-weighted)
-- results: a 0.75 majority is a win, not "not exactly 1".

alter table public.battles add column closed_at timestamptz;
create index battles_open_created_idx on public.battles (created_at) where status = 'open';

-- Byte-identical to 20260624120000_security_hardening.sql:77 except the two
-- battle_wins case-expressions now use majority (> / < 0.5) instead of = 1 / = 0.
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
         battle_wins = battle_wins + (case when p_result_for_a > 0.5 then 1 else 0 end)
   where id = p_perf_a;

  update public.performances
     set elo_rating = new_b,
         battle_count = battle_count + 1,
         battle_wins = battle_wins + (case when p_result_for_a < 0.5 then 1 else 0 end)
   where id = p_perf_b;

  rating_a := new_a;
  rating_b := new_b;
  return next;
end;
$$;

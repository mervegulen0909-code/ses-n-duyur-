-- Release integrity hardening.
--
-- The badge catalog becomes public-readable/server-managed, battle closing is
-- one idempotent transaction, and vote insertion shares a transaction with
-- score recomputation.

-- Badge catalog: public read, service-only mutation.
alter table public.badges enable row level security;
drop policy if exists badges_select_all on public.badges;
create policy badges_select_all on public.badges for select using (true);

revoke insert, update, delete, truncate, references, trigger
  on table public.badges from anon, authenticated;
grant select on table public.badges to anon, authenticated;

-- Persist the final result so downstream readers never need to re-derive it.
alter table public.battles
  add column result_for_a numeric,
  add column winner_performance_id uuid references public.performances (id) on delete set null,
  add constraint battles_result_for_a_range
    check (result_for_a is null or result_for_a between 0 and 1);

create or replace function public.close_battle_atomic(
  p_battle_id uuid,
  p_cutoff timestamptz
)
returns table (
  closed boolean,
  applied boolean,
  result_for_a numeric,
  winner_performance_id uuid,
  winner_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.battles%rowtype;
  v_total integer;
  v_votes_a integer;
  v_result numeric;
  v_count_a integer;
  v_count_b integer;
  v_owner_a uuid;
  v_owner_b uuid;
  v_winner_perf uuid;
  v_winner_user uuid;
  v_k numeric;
begin
  -- This row lock is the idempotency boundary. A concurrent waiter observes
  -- status=closed after the first transaction commits and becomes a no-op.
  select b.* into v_battle
    from public.battles b
   where b.id = p_battle_id
   for update;

  if not found
     or v_battle.status <> 'open'
     or v_battle.created_at >= p_cutoff then
    return query select false, false, null::numeric, null::uuid, null::uuid;
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (where bv.winner_performance_id = v_battle.perf_a)::integer
    into v_total, v_votes_a
    from public.battle_votes bv
   where bv.battle_id = p_battle_id
     and bv.is_verified = true;

  if v_total > 0 then
    v_result := v_votes_a::numeric / v_total::numeric;

    select p.battle_count, p.user_id into v_count_a, v_owner_a
      from public.performances p where p.id = v_battle.perf_a;
    select p.battle_count, p.user_id into v_count_b, v_owner_b
      from public.performances p where p.id = v_battle.perf_b;
    if v_count_a is null or v_count_b is null then
      raise exception 'battle performance not found';
    end if;

    v_k := case when least(v_count_a, v_count_b) < 5 then 48 else 24 end;
    perform * from public.apply_battle_result(
      v_battle.perf_a,
      v_battle.perf_b,
      v_result,
      v_k
    );

    if v_result > 0.5 then
      v_winner_perf := v_battle.perf_a;
      v_winner_user := v_owner_a;
    elsif v_result < 0.5 then
      v_winner_perf := v_battle.perf_b;
      v_winner_user := v_owner_b;
    end if;

    if v_winner_perf is not null then
      perform public.grant_badge(v_winner_user, 'battle_champion');
      perform public.award_league_points(
        v_winner_user,
        date_trunc('week', now() at time zone 'utc')::date,
        5,
        'battle_win',
        p_battle_id::text
      );
      perform public.score_battle_predictions(p_battle_id, v_winner_perf);
    else
      update public.battle_predictions
         set is_correct = false
       where battle_id = p_battle_id
         and is_correct is null;
    end if;
  end if;

  update public.battles
     set status = 'closed',
         closed_at = now(),
         result_for_a = v_result,
         winner_performance_id = v_winner_perf
   where id = p_battle_id;

  return query
  select true, (v_total > 0), v_result, v_winner_perf, v_winner_user;
end;
$$;

revoke execute on function public.close_battle_atomic(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.close_battle_atomic(uuid, timestamptz)
  to service_role;

create or replace function public.submit_vote_and_recompute(
  p_voter_id uuid,
  p_performance_id uuid,
  p_verified_listen_id uuid,
  p_vocal_accuracy numeric,
  p_rhythm_timing numeric,
  p_tone_quality numeric,
  p_emotion_interpretation numeric,
  p_technical_skill numeric,
  p_pronunciation_diction numeric,
  p_recording_quality numeric,
  p_originality numeric,
  p_stage_presence numeric,
  p_initial_ai_score numeric,
  p_trend_baseline numeric
)
returns table (
  listener_score numeric,
  current_score numeric,
  trend_score numeric,
  verified_vote_count integer,
  listener_stddev numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_video boolean;
  v_owner_id uuid;
  v_reputation integer;
  v_weight numeric;
  v_recent_votes integer;
begin
  if not exists (
    select 1 from public.verified_listens vl
     where vl.id = p_verified_listen_id
       and vl.user_id = p_voter_id
       and vl.performance_id = p_performance_id
       and vl.is_valid = true
  ) then
    raise exception 'verified_listen_required';
  end if;

  select p.has_video, p.user_id into v_has_video, v_owner_id
    from public.performances p
   where p.id = p_performance_id;
  if not found then raise exception 'performance_not_found'; end if;
  if v_owner_id = p_voter_id then raise exception 'self_vote_forbidden'; end if;

  if p_vocal_accuracy is null
     or p_rhythm_timing is null
     or p_tone_quality is null
     or p_emotion_interpretation is null
     or p_technical_skill is null
     or p_pronunciation_diction is null
     or p_recording_quality is null
     or p_originality is null
     or (v_has_video and p_stage_presence is null)
     or (not v_has_video and p_stage_presence is not null) then
    raise exception 'criteria_incomplete';
  end if;

  select count(*)::integer into v_recent_votes
    from public.criteria_ratings cr
   where cr.voter_id = p_voter_id
     and cr.created_at > now() - interval '24 hours';
  if v_recent_votes >= 50 then raise exception 'daily_vote_limit'; end if;

  select p.reputation into v_reputation
    from public.profiles p where p.id = p_voter_id;
  v_weight := case
    when v_reputation is null or v_reputation = 0 then 1
    else least(1.5, greatest(0.5, v_reputation / 1000.0))
  end;

  insert into public.criteria_ratings (
    performance_id, voter_id, verified_listen_id,
    vocal_accuracy, rhythm_timing, tone_quality, emotion_interpretation,
    technical_skill, pronunciation_diction, recording_quality, originality,
    stage_presence, weight
  ) values (
    p_performance_id, p_voter_id, p_verified_listen_id,
    p_vocal_accuracy, p_rhythm_timing, p_tone_quality, p_emotion_interpretation,
    p_technical_skill, p_pronunciation_diction, p_recording_quality, p_originality,
    p_stage_presence, v_weight
  );

  -- Any recompute error rolls this function call, including the insert, back.
  return query
  select * from public.recompute_performance_score(
    p_performance_id,
    p_initial_ai_score,
    p_trend_baseline
  );
end;
$$;

revoke execute on function public.submit_vote_and_recompute(
  uuid, uuid, uuid,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric
) from public, anon, authenticated;
grant execute on function public.submit_vote_and_recompute(
  uuid, uuid, uuid,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric
) to service_role;

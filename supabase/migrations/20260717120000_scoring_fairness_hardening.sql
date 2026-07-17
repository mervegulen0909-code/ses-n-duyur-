-- Scoring fairness hardening (audit 2026-07-17).
--
-- 1. Sybil warm-up: a brand-new account no longer votes at full weight.
--    Vote weight ramps 0.4 → 1.0 over the voter's first 10 valid Verified
--    Listens; combined with the 30s listen floor this makes fake-account
--    fleets pay real wall-clock time for influence.
-- 2. Re-vote window: a voter may revise their rating for 24h after casting
--    it (same verified listen); afterwards it locks ('vote_locked').
-- 3. Provisional cap relaxes with scale: min(cap, n/(n+60)) where the cap
--    grows 0.55 → 0.75 between 200 and 1000 votes — a huge honest crowd can
--    outweigh a bad metadata estimate, while small crowds still can't.
-- 4. Small-sample winsorize: below the n>=10 trim threshold each vote is
--    clamped to median ± 25, so a single 0/100 troll vote cannot swing an
--    early score.

-- New ops-signal analytics event: the LLM scoring provider silently degraded
-- to the mock despite a configured API key. Mirrors ANALYTICS_EVENTS in
-- packages/core.
alter table public.analytics_events drop constraint if exists analytics_events_event_check;
alter table public.analytics_events add constraint analytics_events_event_check
  check (event in (
    'landing_view','signup_started','signup_completed',
    'performance_request_submitted','performance_request_approved',
    'verified_listen_completed','vote_submitted','battle_completed',
    'share_clicked','challenge_opened','invite_converted',
    'share_rendered','challenge_link_visited','guest_battle_started',
    'prediction_submitted','scoring_mock_fallback'));

create or replace function public.recompute_performance_score(
  p_performance_id uuid,
  p_initial_ai_score numeric,
  p_trend_baseline numeric
) returns table (
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
  v_score_status text;
  v_score_source text;
  v_stored_ai_score numeric;
  v_ai_basis numeric;
  v_listener_score numeric;
  v_current_score numeric;
  v_vote_count integer;
  v_listener_weight numeric;
  v_listener_stddev numeric;
begin
  if p_trend_baseline is null or p_trend_baseline < 0 or p_trend_baseline > 100 then
    raise exception 'trend baseline must be between 0 and 100';
  end if;

  select score_status, initial_ai_score
    into v_score_status, v_stored_ai_score
    from public.scores
   where performance_id = p_performance_id
   for update;
  if not found then raise exception 'score row not found'; end if;

  v_ai_basis := case
    when v_score_status = 'ai_verified' then v_stored_ai_score
    else p_initial_ai_score
  end;
  if v_ai_basis is null or v_ai_basis < 0 or v_ai_basis > 100 then
    raise exception 'initial AI score must be between 0 and 100';
  end if;

  select has_video into v_has_video
    from public.performances where id = p_performance_id;
  if v_has_video is null then raise exception 'performance not found'; end if;

  with per_vote as (
    select
      id,
      weight,
      case when v_has_video then
        (0.20*vocal_accuracy + 0.13*rhythm_timing + 0.12*tone_quality
         + 0.13*emotion_interpretation + 0.13*technical_skill
         + 0.09*pronunciation_diction + 0.07*recording_quality
         + 0.08*originality + 0.05*stage_presence) / 1.00
      else
        (0.20*vocal_accuracy + 0.13*rhythm_timing + 0.12*tone_quality
         + 0.13*emotion_interpretation + 0.13*technical_skill
         + 0.09*pronunciation_diction + 0.07*recording_quality
         + 0.08*originality) / 0.95
      end as overall
      from public.criteria_ratings
     where performance_id = p_performance_id
       and vocal_accuracy is not null and rhythm_timing is not null
       and tone_quality is not null and emotion_interpretation is not null
       and technical_skill is not null and pronunciation_diction is not null
       and recording_quality is not null and originality is not null
       and (v_has_video = false or stage_presence is not null)
       and (v_has_video = true or stage_presence is null)
  ),
  counted as (
    select count(*)::integer as n, percentile_cont(0.5) within group (order by overall) as med
      from per_vote
  ),
  winsorized as (
    -- Below the trim threshold every vote would otherwise carry full weight;
    -- clamp each overall to median ± 25 so one extreme vote can't swing an
    -- early score. At n >= 10 the 10% trim below takes over instead.
    select
      pv.id,
      pv.weight,
      case when c.n < 10
           then greatest(c.med - 25, least(c.med + 25, pv.overall))
           else pv.overall end as overall
      from per_vote pv cross join counted c
  ),
  ranked as (
    select
      weight,
      overall,
      row_number() over (order by overall, weight, id) as rn,
      count(*) over () as n
      from winsorized
  )
  select
    coalesce(max(n), 0)::integer,
    sum(weight * overall) filter (
      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))
    ) / nullif(sum(weight) filter (
      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))
    ), 0),
    stddev_samp(overall) filter (
      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))
    )
    into v_vote_count, v_listener_score, v_listener_stddev
    from ranked;

  if v_vote_count = 0 or v_listener_score is null then
    v_listener_score := null;
    v_listener_stddev := null;
    v_current_score := round(v_ai_basis, 2);
    v_vote_count := coalesce(v_vote_count, 0);
    v_score_source := case
      when v_score_status = 'ai_verified' then 'owned_audio_ai'
      else 'metadata_estimate'
    end;
  else
    v_listener_weight := case
      when v_score_status = 'ai_verified' then least(1.0, v_vote_count / 100.0)
      else least(0.55 + 0.20 * least(1.0, greatest(0, v_vote_count - 200) / 800.0), v_vote_count / (v_vote_count + 60.0))
    end;
    v_listener_score := round(v_listener_score, 2);
    v_listener_stddev := round(v_listener_stddev, 2);
    v_current_score := round(
      ((1 - v_listener_weight) * v_ai_basis)
      + (v_listener_weight * v_listener_score), 2);
    v_score_source := case
      when v_score_status <> 'ai_verified' then 'metadata_estimate'
      when v_vote_count >= 100 then 'community'
      else 'ai_community_hybrid'
    end;
  end if;

  update public.scores
     set listener_score = v_listener_score,
         current_score = v_current_score,
         trend_score = round(v_current_score - p_trend_baseline, 2),
         verified_vote_count = v_vote_count,
         listener_stddev = v_listener_stddev,
         score_source = v_score_source
   where performance_id = p_performance_id;

  return query
  select v_listener_score, v_current_score,
         round(v_current_score - p_trend_baseline, 2), v_vote_count,
         v_listener_stddev;
end;
$$;

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
) returns table (
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
  v_prior_listens integer;
  v_warmup numeric;
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

  -- Sybil warm-up: influence ramps with PROVEN listening history, not account
  -- existence. 0 prior valid listens → 0.4x; full weight from the 10th listen.
  -- Each valid listen costs >= 30s of server-anchored wall-clock, so a fleet
  -- of fresh accounts cannot buy full-weight votes cheaply.
  select count(*)::integer into v_prior_listens
    from public.verified_listens vl
   where vl.user_id = p_voter_id
     and vl.is_valid;
  v_warmup := least(1.0, 0.4 + 0.06 * v_prior_listens);
  v_weight := round(v_weight * v_warmup, 3);

  -- One rating per (voter, performance); revisable for 24 hours, then locked.
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
  )
  on conflict (voter_id, performance_id) do update
     set vocal_accuracy = excluded.vocal_accuracy,
         rhythm_timing = excluded.rhythm_timing,
         tone_quality = excluded.tone_quality,
         emotion_interpretation = excluded.emotion_interpretation,
         technical_skill = excluded.technical_skill,
         pronunciation_diction = excluded.pronunciation_diction,
         recording_quality = excluded.recording_quality,
         originality = excluded.originality,
         stage_presence = excluded.stage_presence,
         weight = excluded.weight,
         verified_listen_id = excluded.verified_listen_id
   where criteria_ratings.created_at > now() - interval '24 hours';
  if not found then raise exception 'vote_locked'; end if;

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

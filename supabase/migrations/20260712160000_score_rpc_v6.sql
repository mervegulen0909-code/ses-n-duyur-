-- RPC v6 (scoring hardening): two correctness fixes over v5
-- (20260712120000_score_trimmed_mean.sql). Return type is UNCHANGED, so a plain
-- create-or-replace is enough (no drop / re-grant needed).
--
--  1. DETERMINISM: v5's `row_number() over (order by overall)` had no tiebreaker,
--     so when equal-overall rows with different weights straddled the trim
--     boundary, which one got trimmed was arbitrary and the weighted mean
--     varied across byte-identical input. Adding `weight, id` makes the rank
--     total-ordered and the trimmed mean reproducible.
--  2. HONEST CONFIDENCE: v5 computed `stddev_samp(overall)` over ALL votes
--     (untrimmed) while the score is the TRIMMED weighted mean, so the UI's
--     "± interval" was sized by the very outliers the score removed (e.g.
--     "80.0 ± 15.7" when the trimmed sample is all 80s). Compute stddev over the
--     SAME trimmed set so the interval reflects the data behind the score.
--
-- Weights MUST match packages/scoring/src/criteria.ts DEFAULT_CRITERION_WEIGHTS
-- — guarded by packages/scoring/src/sql-parity.test.ts.

create or replace function public.recompute_performance_score(
  p_performance_id uuid,
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
  v_listener_score numeric;
  v_current_score numeric;
  v_vote_count integer;
  v_listener_weight numeric;
  v_listener_stddev numeric;
begin
  if p_initial_ai_score is null or p_initial_ai_score < 0 or p_initial_ai_score > 100 then
    raise exception 'initial AI score must be between 0 and 100';
  end if;
  if p_trend_baseline is null or p_trend_baseline < 0 or p_trend_baseline > 100 then
    raise exception 'trend baseline must be between 0 and 100';
  end if;

  -- Serialize all score recomputations for this performance. A later waiter
  -- sees the earlier committed rating and produces the complete aggregate.
  perform 1 from public.scores where performance_id = p_performance_id for update;
  if not found then raise exception 'score row not found'; end if;

  select has_video into v_has_video from public.performances where id = p_performance_id;
  if v_has_video is null then raise exception 'performance not found'; end if;

  -- Per-vote criterion-weighted overalls, ranked so the top and bottom 10%
  -- can be trimmed once enough votes exist (robustness against brigading and
  -- score-bombing outliers that survive the verified-listen gate).
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
  ranked as (
    select
      weight,
      overall,
      -- Total order (overall, weight, id) → deterministic trim on ties.
      row_number() over (order by overall, weight, id) as rn,
      count(*) over () as n
      from per_vote
  )
  select
    coalesce(max(n), 0)::integer,
    sum(weight * overall) filter (
      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))
    ) / nullif(sum(weight) filter (
      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))
    ), 0),
    -- Stddev over the SAME trimmed set the mean uses, so the UI interval
    -- reflects the retained data, not the trimmed-away outliers.
    stddev_samp(overall) filter (
      where n < 10 or (rn > floor(n * 0.1) and rn <= n - floor(n * 0.1))
    )
    into v_vote_count, v_listener_score, v_listener_stddev
    from ranked;

  if v_vote_count = 0 or v_listener_score is null then
    v_listener_score := null;
    v_listener_stddev := null;
    v_current_score := round(p_initial_ai_score, 2);
    v_vote_count := coalesce(v_vote_count, 0);
  else
    v_listener_weight := least(0.55, v_vote_count / (v_vote_count + 60.0));
    v_listener_score := round(v_listener_score, 2);
    v_listener_stddev := round(v_listener_stddev, 2);
    v_current_score := round(
      ((1 - v_listener_weight) * p_initial_ai_score)
      + (v_listener_weight * v_listener_score), 2);
  end if;

  update public.scores
     set listener_score = v_listener_score,
         current_score = v_current_score,
         trend_score = round(v_current_score - p_trend_baseline, 2),
         verified_vote_count = v_vote_count,
         listener_stddev = v_listener_stddev
   where performance_id = p_performance_id;

  return query
  select v_listener_score, v_current_score,
         round(v_current_score - p_trend_baseline, 2), v_vote_count,
         v_listener_stddev;
end;
$$;

-- create-or-replace preserves grants, but re-assert the least-privilege posture
-- in case the function was ever recreated with default grants.
revoke execute on function public.recompute_performance_score(uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.recompute_performance_score(uuid, numeric, numeric)
  to service_role;

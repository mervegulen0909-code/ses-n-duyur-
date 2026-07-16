-- Restore first-class provisional estimates (launch model).
--
-- Product decision 2026-07-17: the league cannot start empty. Every performance
-- gets a clearly-labeled, deterministic metadata estimate the moment it is
-- added, listeners vote on it (listener weight capped at 0.55 until verified),
-- and the AI Judge owned-audio pipeline remains the ONLY path to 'ai_verified'.
-- YouTube stays embed-only; estimates are never presented as measurements.

-- 1. New status value for metadata estimates. 'legacy_metadata' rows ARE
--    metadata estimates — unify them under the new name (the old value stays
--    in the check so an in-flight deploy can never violate the constraint).
alter table public.scores drop constraint if exists scores_score_status_check;
alter table public.scores add constraint scores_score_status_check
  check (score_status in (
    'unscored', 'reference_required', 'analysis_pending',
    'quality_rejected', 'technique_only', 'ai_verified',
    'provisional_estimate', 'legacy_metadata', 'analysis_failed'
  ));

update public.scores
   set score_status = 'provisional_estimate'
 where score_status = 'legacy_metadata';

-- 2. Creation writes the provisional estimate again (score_status
--    'provisional_estimate'); the unscored branch stays for robustness.
create or replace function public.create_scored_performance_atomic(
  p_user_id uuid,
  p_song_id uuid,
  p_source text,
  p_youtube_video_id text,
  p_oembed_meta jsonb,
  p_duration_s integer,
  p_has_video boolean,
  p_status text,
  p_scoring_version integer,
  p_initial_ai_score numeric,
  p_ai_breakdown jsonb,
  p_ai_breakdown_raw jsonb,
  p_is_provisional boolean,
  p_ai_provider text,
  p_ai_model text,
  p_season_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_performance_id uuid;
begin
  insert into public.performances (
    user_id, song_id, source, youtube_video_id, oembed_meta,
    duration_s, has_video, status
  ) values (
    p_user_id, p_song_id, p_source, p_youtube_video_id, p_oembed_meta,
    p_duration_s, p_has_video, p_status
  ) returning id into v_performance_id;

  insert into public.scores (
    performance_id, scoring_version, initial_ai_score, ai_breakdown,
    ai_breakdown_raw, is_provisional, ai_provider, ai_model, season_id,
    listener_score, current_score, trend_score, verified_vote_count,
    score_status, score_source
  ) values (
    v_performance_id, p_scoring_version, p_initial_ai_score, p_ai_breakdown,
    p_ai_breakdown_raw, p_is_provisional, p_ai_provider, p_ai_model, p_season_id,
    null, p_initial_ai_score, case when p_initial_ai_score is null then null else 0 end, 0,
    case when p_initial_ai_score is null then 'unscored' else 'provisional_estimate' end,
    case when p_initial_ai_score is null then 'none' else 'metadata_estimate' end
  );

  return v_performance_id;
end;
$$;

-- 3. A REJECTED verification must not erase an existing score. Only rows that
--    never had a score (initial_ai_score is null) fall to 'quality_rejected';
--    provisional and previously-verified rows keep their visible score, and the
--    rejection stays fully auditable in analysis_sessions/analysis_results.
create or replace function public.finalize_ai_analysis(
  p_session_id uuid,
  p_result jsonb,
  p_ai_score numeric,
  p_confidence numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.analysis_sessions%rowtype;
  v_result_id uuid;
  v_passed boolean;
begin
  select * into v_session
    from public.analysis_sessions
   where id = p_session_id
   for update;
  if not found then raise exception 'analysis_session_not_found'; end if;

  if v_session.status = 'completed' or v_session.status = 'rejected' then
    select id into v_result_id
      from public.analysis_results where session_id = p_session_id;
    if v_result_id is null then raise exception 'analysis_result_missing'; end if;
    return v_result_id;
  end if;
  if v_session.status in ('failed', 'expired') then
    raise exception 'analysis_session_closed';
  end if;
  if v_session.expires_at <= now() then raise exception 'analysis_session_expired'; end if;
  if p_result->>'sessionId' is distinct from p_session_id::text then
    raise exception 'analysis_session_mismatch';
  end if;

  v_passed := coalesce((p_result #>> '{qualityGate,passed}')::boolean, false);
  if jsonb_typeof(p_result->'qualityGate') is distinct from 'object'
     or jsonb_typeof(p_result->'rawMetrics') is distinct from 'object'
     or coalesce((p_result->>'pipelineVersion')::integer, 0) <= 0
     or nullif(p_result->>'pitchEngine', '') is null
     or nullif(p_result->>'pitchEngineVersion', '') is null
     or coalesce(p_result->>'audioSha256', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_analysis_result';
  end if;
  if v_passed and (
    p_ai_score is null or p_ai_score < 0 or p_ai_score > 100
    or p_confidence is null or p_confidence < 0 or p_confidence > 1
    or jsonb_typeof(p_result->'measuredBreakdown') is distinct from 'object'
  ) then
    raise exception 'invalid_passed_analysis';
  end if;

  insert into public.analysis_results (
    session_id, performance_id, user_id, reference_id,
    pipeline_version, pitch_engine, pitch_engine_version,
    quality_gate, raw_metrics, measured_breakdown,
    ai_score, confidence, audio_sha256
  ) values (
    p_session_id, v_session.performance_id, v_session.user_id, v_session.reference_id,
    (p_result->>'pipelineVersion')::integer,
    p_result->>'pitchEngine', p_result->>'pitchEngineVersion',
    p_result->'qualityGate', p_result->'rawMetrics', p_result->'measuredBreakdown',
    case when v_passed then round(p_ai_score, 2) else null end,
    case when v_passed then p_confidence else null end,
    p_result->>'audioSha256'
  ) returning id into v_result_id;

  update public.analysis_sessions
     set status = case when v_passed then 'completed' else 'rejected' end,
         completed_at = now(),
         error_code = case when v_passed then null
           else p_result #>> '{qualityGate,reason}' end
   where id = p_session_id;

  if v_passed then
    update public.scores
       set scoring_version = 5,
           initial_ai_score = round(p_ai_score, 2),
           ai_breakdown = p_result->'measuredBreakdown',
           ai_breakdown_raw = p_result->'measuredBreakdown',
           is_provisional = false,
           ai_provider = 'voxscore-dsp',
           ai_model = 'ai-judge-pipeline-v' || (p_result->>'pipelineVersion'),
           score_status = case
             when v_session.mode = 'technique_test' then 'technique_only'
             else 'ai_verified'
           end,
           score_source = 'owned_audio_ai',
           ai_judge_confidence = p_confidence,
           analysis_result_id = v_result_id
     where performance_id = v_session.performance_id;
    if not found then raise exception 'score_row_not_found'; end if;

    if v_session.mode = 'song_reference' then
      perform * from public.recompute_performance_score(
        v_session.performance_id, p_ai_score, p_ai_score
      );
    else
      update public.scores
         set listener_score = null,
             listener_stddev = null,
             current_score = round(p_ai_score, 2),
             trend_score = 0,
             verified_vote_count = 0
       where performance_id = v_session.performance_id;
    end if;
  else
    update public.scores
       set score_status = 'quality_rejected',
           score_source = 'none',
           ai_judge_confidence = null,
           analysis_result_id = v_result_id
     where performance_id = v_session.performance_id
       and initial_ai_score is null;
  end if;

  return v_result_id;
end;
$$;

-- 4. Atomic stale-session cleanup: expire abandoned sessions AND release a
--    score stuck in 'analysis_pending' back to its true state. Fixes the bug
--    where a performer who abandoned an upload saw "analyzing…" forever.
create or replace function public.expire_stale_analysis_sessions(p_performance_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.analysis_sessions
     set status = 'expired'
   where performance_id = p_performance_id
     and status in ('created', 'uploading', 'processing')
     and expires_at <= now();

  update public.scores s
     set score_status = case
           when s.initial_ai_score is null then 'unscored'
           when s.is_provisional then 'provisional_estimate'
           else 'ai_verified'
         end,
         score_source = case
           when s.initial_ai_score is null then 'none'
           when s.is_provisional then 'metadata_estimate'
           else 'owned_audio_ai'
         end
   where s.performance_id = p_performance_id
     and s.score_status = 'analysis_pending'
     and not exists (
       select 1 from public.analysis_sessions a
        where a.performance_id = p_performance_id
          and a.status in ('created', 'uploading', 'processing')
          and a.expires_at > now()
     );
end;
$$;

revoke execute on function public.expire_stale_analysis_sessions(uuid)
  from public, anon, authenticated;
grant execute on function public.expire_stale_analysis_sessions(uuid)
  to service_role;

-- 5. One-time repair of rows already stuck by the old behavior: scores parked
--    in 'analysis_pending'/'reference_required' with no live session, and
--    'quality_rejected' rows whose estimate was wrongly hidden.
update public.scores s
   set score_status = case
         when s.initial_ai_score is null then 'unscored'
         when s.is_provisional then 'provisional_estimate'
         else 'ai_verified'
       end,
       score_source = case
         when s.initial_ai_score is null then 'none'
         when s.is_provisional then 'metadata_estimate'
         else 'owned_audio_ai'
       end
 where s.score_status in ('analysis_pending', 'reference_required')
   and not exists (
     select 1 from public.analysis_sessions a
      where a.performance_id = s.performance_id
        and a.status in ('created', 'uploading', 'processing')
        and a.expires_at > now()
   );

update public.scores
   set score_status = case when is_provisional then 'provisional_estimate' else 'ai_verified' end,
       score_source = case when is_provisional then 'metadata_estimate' else 'owned_audio_ai' end
 where score_status = 'quality_rejected'
   and initial_ai_score is not null;

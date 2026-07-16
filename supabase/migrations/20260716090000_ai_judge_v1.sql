-- VoxScore AI Judge v1.
--
-- YouTube remains embed-only. An AI-verified score can be created only from a
-- performer-owned recording that passes the server-side quality gate. Existing
-- metadata/LLM estimates remain explicitly marked as legacy_metadata.

alter table public.scores
  add column score_status text not null default 'legacy_metadata'
    check (score_status in (
      'unscored', 'reference_required', 'analysis_pending',
      'quality_rejected', 'technique_only', 'ai_verified',
      'legacy_metadata', 'analysis_failed'
    )),
  add column score_source text not null default 'metadata_estimate'
    check (score_source in (
      'none', 'metadata_estimate', 'owned_audio_ai',
      'ai_community_hybrid', 'community'
    )),
  add column ai_judge_confidence numeric(5, 4)
    check (ai_judge_confidence between 0 and 1);

update public.scores
   set score_status = case
         when initial_ai_score is null then 'unscored'
         else 'legacy_metadata'
       end,
       score_source = case
         when initial_ai_score is null then 'none'
         else 'metadata_estimate'
       end;

alter table public.scores drop constraint if exists scores_ai_provider_check;
alter table public.scores add constraint scores_ai_provider_check
  check (ai_provider in ('anthropic', 'openai', 'gemini', 'mock', 'voxscore-dsp'));

create table public.song_references (
  id                uuid primary key default gen_random_uuid(),
  song_id           uuid not null references public.songs (id) on delete cascade,
  status            text not null default 'draft'
    check (status in ('draft', 'ready', 'retired')),
  reference_version integer not null default 1 check (reference_version > 0),
  source_type       text not null
    check (source_type in ('licensed_midi', 'admin_annotation')),
  notes             jsonb not null check (jsonb_typeof(notes) = 'array'),
  duration_ms       integer not null check (duration_ms > 0),
  tonic_midi        integer check (tonic_midi between 0 and 127),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (song_id, reference_version)
);

create unique index song_references_one_ready_per_song_idx
  on public.song_references (song_id) where status = 'ready';

create trigger song_references_set_updated_at
  before update on public.song_references
  for each row execute function public.set_updated_at();

create table public.analysis_sessions (
  id                uuid primary key default gen_random_uuid(),
  performance_id    uuid not null references public.performances (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  reference_id      uuid references public.song_references (id) on delete restrict,
  mode              text not null
    check (mode in ('song_reference', 'technique_test')),
  status            text not null default 'created'
    check (status in (
      'created', 'uploading', 'processing', 'completed',
      'rejected', 'failed', 'expired'
    )),
  upload_nonce_hash text not null,
  expires_at        timestamptz not null,
  attempt_count     integer not null default 0 check (attempt_count >= 0),
  error_code        text,
  error_message     text,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz
);

create index analysis_sessions_owner_idx
  on public.analysis_sessions (user_id, created_at desc);
create index analysis_sessions_performance_idx
  on public.analysis_sessions (performance_id, created_at desc);
create unique index analysis_sessions_one_active_idx
  on public.analysis_sessions (performance_id)
  where status in ('created', 'uploading', 'processing');

create table public.analysis_results (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null unique references public.analysis_sessions (id) on delete cascade,
  performance_id       uuid not null references public.performances (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  reference_id         uuid references public.song_references (id) on delete restrict,
  pipeline_version     integer not null check (pipeline_version > 0),
  pitch_engine         text not null,
  pitch_engine_version text not null,
  quality_gate         jsonb not null check (jsonb_typeof(quality_gate) = 'object'),
  raw_metrics          jsonb not null check (jsonb_typeof(raw_metrics) = 'object'),
  measured_breakdown   jsonb check (
    measured_breakdown is null or jsonb_typeof(measured_breakdown) = 'object'
  ),
  ai_score             numeric(5, 2) check (ai_score between 0 and 100),
  confidence           numeric(5, 4) check (confidence between 0 and 1),
  audio_sha256         text not null check (audio_sha256 ~ '^[0-9a-f]{64}$'),
  created_at           timestamptz not null default now()
);

create index analysis_results_performance_idx
  on public.analysis_results (performance_id, created_at desc);

alter table public.scores
  add column analysis_result_id uuid references public.analysis_results (id) on delete set null;

alter table public.song_references enable row level security;
alter table public.analysis_sessions enable row level security;
alter table public.analysis_results enable row level security;

create policy song_references_select_ready on public.song_references
  for select using (status = 'ready');
create policy song_references_admin_all on public.song_references
  for all using (public.is_admin()) with check (public.is_admin());

create policy analysis_sessions_select_own on public.analysis_sessions
  for select using (user_id = auth.uid() or public.is_admin());
create policy analysis_results_select_own on public.analysis_results
  for select using (user_id = auth.uid() or public.is_admin());

-- v7 keeps the hardened trimmed listener aggregate from v6. AI-verified rows
-- use a linear handoff: vote_count / 100, capped at 1. At vote 100 the AI
-- contribution is exactly zero. Legacy rows retain the old v4 blend.
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
  ranked as (
    select
      weight,
      overall,
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
      else least(0.55, v_vote_count / (v_vote_count + 60.0))
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

revoke execute on function public.recompute_performance_score(uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.recompute_performance_score(uuid, numeric, numeric)
  to service_role;

-- Inserts an immutable Analyzer result and promotes the score in one
-- transaction. Retried callbacks return the original result id.
create function public.finalize_ai_analysis(
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
     where performance_id = v_session.performance_id;
  end if;

  return v_result_id;
end;
$$;

revoke execute on function public.finalize_ai_analysis(uuid, jsonb, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.finalize_ai_analysis(uuid, jsonb, numeric, numeric)
  to service_role;

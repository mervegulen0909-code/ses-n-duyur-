-- VoxScore score integrity hardening.
-- Keeps rating writes bounded and makes score denormalization atomic.

-- Every persisted criterion must remain a real 0-100 rating. Nullable columns
-- are intentional only for stage_presence on audio-only performances.
alter table public.criteria_ratings
  add constraint criteria_ratings_vocal_accuracy_range
    check (vocal_accuracy is null or vocal_accuracy between 0 and 100),
  add constraint criteria_ratings_rhythm_timing_range
    check (rhythm_timing is null or rhythm_timing between 0 and 100),
  add constraint criteria_ratings_tone_quality_range
    check (tone_quality is null or tone_quality between 0 and 100),
  add constraint criteria_ratings_emotion_interpretation_range
    check (emotion_interpretation is null or emotion_interpretation between 0 and 100),
  add constraint criteria_ratings_technical_skill_range
    check (technical_skill is null or technical_skill between 0 and 100),
  add constraint criteria_ratings_pronunciation_diction_range
    check (pronunciation_diction is null or pronunciation_diction between 0 and 100),
  add constraint criteria_ratings_recording_quality_range
    check (recording_quality is null or recording_quality between 0 and 100),
  add constraint criteria_ratings_originality_range
    check (originality is null or originality between 0 and 100),
  add constraint criteria_ratings_stage_presence_range
    check (stage_presence is null or stage_presence between 0 and 100);

-- Mirror the API's fairness rules at the direct Supabase/RLS boundary too:
-- no self-votes, no partial votes, and no stage-presence rating for audio-only
-- performances.
drop policy if exists criteria_ratings_insert_verified on public.criteria_ratings;
create policy criteria_ratings_insert_verified on public.criteria_ratings
  for insert with check (
    voter_id = auth.uid()
    and exists (
      select 1
      from public.verified_listens vl
      where vl.id = verified_listen_id
        and vl.user_id = auth.uid()
        and vl.performance_id = criteria_ratings.performance_id
        and vl.is_valid = true
    )
    and exists (
      select 1
      from public.performances p
      where p.id = criteria_ratings.performance_id
        and p.user_id <> auth.uid()
        and (
          (
            p.has_video = true
            and vocal_accuracy is not null
            and rhythm_timing is not null
            and tone_quality is not null
            and emotion_interpretation is not null
            and technical_skill is not null
            and pronunciation_diction is not null
            and recording_quality is not null
            and originality is not null
            and stage_presence is not null
          )
          or (
            p.has_video = false
            and vocal_accuracy is not null
            and rhythm_timing is not null
            and tone_quality is not null
            and emotion_interpretation is not null
            and technical_skill is not null
            and pronunciation_diction is not null
            and recording_quality is not null
            and originality is not null
            and stage_presence is null
          )
        )
    )
  );

-- Recompute the denormalized score while holding the score row lock. The
-- caller supplies the effective starting basis (including DSP replacements)
-- and the original AI score used as the user-facing trend baseline.
create or replace function public.recompute_performance_score(
  p_performance_id uuid,
  p_initial_ai_score numeric,
  p_trend_baseline numeric
)
returns table (
  listener_score numeric,
  current_score numeric,
  trend_score numeric,
  verified_vote_count integer
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
  v_ai_weight numeric;
  v_listener_weight numeric;
begin
  if p_initial_ai_score is null or p_initial_ai_score < 0 or p_initial_ai_score > 100 then
    raise exception 'initial AI score must be between 0 and 100';
  end if;
  if p_trend_baseline is null or p_trend_baseline < 0 or p_trend_baseline > 100 then
    raise exception 'trend baseline must be between 0 and 100';
  end if;

  -- Serialize all score recomputations for this performance. A later waiter
  -- sees the earlier committed rating and produces the complete aggregate.
  perform 1
    from public.scores
   where performance_id = p_performance_id
   for update;
  if not found then
    raise exception 'score row not found';
  end if;

  select has_video
    into v_has_video
    from public.performances
   where id = p_performance_id;
  if v_has_video is null then
    raise exception 'performance not found';
  end if;

  select
    count(*)::integer,
    avg(
      case
        when v_has_video then
          (vocal_accuracy + rhythm_timing + tone_quality + emotion_interpretation
            + technical_skill + pronunciation_diction + recording_quality
            + originality + stage_presence) / 9.0
        else
          (vocal_accuracy + rhythm_timing + tone_quality + emotion_interpretation
            + technical_skill + pronunciation_diction + recording_quality
            + originality) / 8.0
      end
    )
    into v_vote_count, v_listener_score
    from public.criteria_ratings
   where performance_id = p_performance_id
     and vocal_accuracy is not null
     and rhythm_timing is not null
     and tone_quality is not null
     and emotion_interpretation is not null
     and technical_skill is not null
     and pronunciation_diction is not null
     and recording_quality is not null
     and originality is not null
     and (v_has_video = false or stage_presence is not null)
     and (v_has_video = true or stage_presence is null);

  if v_vote_count = 0 then
    v_listener_score := null;
    v_current_score := round(p_initial_ai_score, 2);
  else
    if v_vote_count <= 25 then
      v_ai_weight := 0.85;
      v_listener_weight := 0.15;
    elsif v_vote_count <= 100 then
      v_ai_weight := 0.75;
      v_listener_weight := 0.25;
    elsif v_vote_count <= 500 then
      v_ai_weight := 0.65;
      v_listener_weight := 0.35;
    elsif v_vote_count <= 2000 then
      v_ai_weight := 0.55;
      v_listener_weight := 0.45;
    else
      v_ai_weight := 0.45;
      v_listener_weight := 0.55;
    end if;
    v_listener_score := round(v_listener_score, 2);
    v_current_score := round(
      (v_ai_weight * p_initial_ai_score) + (v_listener_weight * v_listener_score),
      2
    );
  end if;

  update public.scores
     set listener_score = v_listener_score,
         current_score = v_current_score,
         trend_score = round(v_current_score - p_trend_baseline, 2),
         verified_vote_count = v_vote_count
   where performance_id = p_performance_id;

  return query
  select v_listener_score,
         v_current_score,
         round(v_current_score - p_trend_baseline, 2),
         v_vote_count;
end;
$$;

-- The RPC bypasses RLS and is callable only by the server-side service role.
revoke execute on function public.recompute_performance_score(uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.recompute_performance_score(uuid, numeric, numeric)
  to service_role;

-- A performance and its mandatory score row are one aggregate. Creating both
-- in one function prevents a scoreless orphan even if the score insert fails.
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
    ai_breakdown_raw, is_provisional, ai_provider, ai_model, season_id
  ) values (
    v_performance_id, p_scoring_version, p_initial_ai_score, p_ai_breakdown,
    p_ai_breakdown_raw, p_is_provisional, p_ai_provider, p_ai_model, p_season_id
  );

  return v_performance_id;
end;
$$;

revoke execute on function public.create_scored_performance_atomic(
  uuid, uuid, text, text, jsonb, integer, boolean, text,
  integer, numeric, jsonb, jsonb, boolean, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_scored_performance_atomic(
  uuid, uuid, text, text, jsonb, integer, boolean, text,
  integer, numeric, jsonb, jsonb, boolean, text, text, uuid
) to service_role;

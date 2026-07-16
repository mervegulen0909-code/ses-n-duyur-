-- Atomically retire the previous ready melody reference and publish a new
-- immutable version. Only the service-role admin API may call this function.
create function public.publish_song_reference(
  p_song_id uuid,
  p_source_type text,
  p_notes jsonb,
  p_duration_ms integer,
  p_tonic_midi integer,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference_id uuid;
  v_next_version integer;
begin
  if p_source_type not in ('licensed_midi', 'admin_annotation') then
    raise exception 'invalid_reference_source';
  end if;
  if p_duration_ms is null or p_duration_ms <= 0
     or jsonb_typeof(p_notes) is distinct from 'array'
     or jsonb_array_length(p_notes) < 2 then
    raise exception 'invalid_song_reference';
  end if;
  if p_tonic_midi is not null and (p_tonic_midi < 0 or p_tonic_midi > 127) then
    raise exception 'invalid_tonic_midi';
  end if;
  perform 1 from public.songs where id = p_song_id;
  if not found then raise exception 'song_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_song_id::text, 0));
  select coalesce(max(reference_version), 0) + 1
    into v_next_version
    from public.song_references
   where song_id = p_song_id;

  update public.song_references
     set status = 'retired'
   where song_id = p_song_id and status = 'ready';

  insert into public.song_references (
    song_id, status, reference_version, source_type, notes,
    duration_ms, tonic_midi, created_by
  ) values (
    p_song_id, 'ready', v_next_version, p_source_type, p_notes,
    p_duration_ms, p_tonic_midi, p_created_by
  ) returning id into v_reference_id;

  update public.scores s
     set score_status = 'unscored', score_source = 'none'
    from public.performances p
   where p.song_id = p_song_id
     and s.performance_id = p.id
     and s.score_status = 'reference_required';

  return v_reference_id;
end;
$$;

revoke execute on function public.publish_song_reference(uuid, text, jsonb, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_song_reference(uuid, text, jsonb, integer, integer, uuid)
  to service_role;

-- Preserve public catalog entries when an owning account is deleted.
--
-- profiles(id) cascades from auth.users(id), and performances.user_id cascades
-- from profiles(id). That is correct for drafts/hidden personal data, but it is
-- too destructive for public launch-catalog performances: deleting the owner
-- would also delete the public performance, score, battle history, and song
-- ranking rows. Before a profile disappears, move active performances to the
-- non-human VoxScore system profile instead.

create or replace function public.preserve_active_performances_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system_profile_id uuid;
begin
  -- The system catalog owner is operational infrastructure, not a normal user.
  -- If its auth user is deleted by mistake, fail the cascade before public
  -- catalog rows can be orphaned or removed.
  if old.handle = 'voxscore' then
    raise exception 'cannot delete the voxscore system profile';
  end if;

  select p.id into v_system_profile_id
    from public.profiles p
   where p.handle = 'voxscore'
   limit 1;

  if v_system_profile_id is null then
    if exists (
      select 1
        from public.performances p
       where p.user_id = old.id
         and p.status = 'active'
    ) then
      raise exception
        'voxscore system profile is required before deleting a profile with active performances';
    end if;

    return old;
  end if;

  update public.performances
     set user_id = v_system_profile_id
   where user_id = old.id
     and status = 'active';

  return old;
end;
$$;

drop trigger if exists profiles_preserve_active_performances_before_delete
  on public.profiles;

create trigger profiles_preserve_active_performances_before_delete
  before delete on public.profiles
  for each row execute function public.preserve_active_performances_on_profile_delete();

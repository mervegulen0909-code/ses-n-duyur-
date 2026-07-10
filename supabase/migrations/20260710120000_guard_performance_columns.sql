-- VoxScore — lock server/moderation-managed performance columns (audit follow-up).
--
-- performances_update_owner (init.sql) authorizes UPDATE purely on row ownership
-- (user_id = auth.uid() or is_admin()) with NO column guard. RLS cannot compare
-- OLD vs NEW, so a performance's owner could PATCH via PostgREST and:
--   1. flip status 'hidden'/'removed' -> 'active', unilaterally reversing an
--      admin moderation-hide or a DMCA takedown (legal/compliance hole);
--   2. overwrite elo_rating / battle_wins / battle_count and top the standings
--      without ever battling (fairness hole — these move ONLY through the
--      service-role apply_battle_result RPC);
--   3. swap youtube_video_id / oembed_meta / source after the AI score was
--      computed at insert time (scored-then-swapped bait-and-switch);
--   4. reassign user_id to dump ownership on someone else.
--
-- Mirror of guard_profile_privileges: a BEFORE UPDATE trigger is the robust
-- place to compare OLD/NEW. End-user requests carry a JWT (auth.uid() non-null);
-- service_role and SQL migrations have auth.uid() null and stay free. Admins
-- must stay free too — /api/admin/moderate and /api/admin/dmca update status
-- through the RLS-scoped USER client (admin JWT), so is_admin() is exempted.
-- This is idempotent and safe to re-run.

create or replace function public.guard_performance_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.elo_rating is distinct from old.elo_rating
       or new.battle_wins is distinct from old.battle_wins
       or new.battle_count is distinct from old.battle_count
       or new.youtube_video_id is distinct from old.youtube_video_id
       or new.oembed_meta is distinct from old.oembed_meta
       or new.source is distinct from old.source
       or new.user_id is distinct from old.user_id then
      raise exception
        'performance status, ratings, and video identity are server-managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists performances_guard_columns on public.performances;
create trigger performances_guard_columns
  before update on public.performances
  for each row execute function public.guard_performance_columns();

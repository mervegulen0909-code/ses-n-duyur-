-- Blocking abusive users.
--
-- App Store Review Guideline 1.2 requires apps with user-generated content to
-- offer "the ability to block abusive users from the service". VoxScore has
-- reporting (moderation_flags) and moderation, but a reporter still had to keep
-- reading the person they reported.
--
-- Scope decision: a block hides the blocked user's COMMENTS from the blocker and
-- severs the follow relationship in both directions. It deliberately does NOT
-- remove their performances from rankings, standings, or battle pairing —
-- VoxScore is a competitive league, and letting a block delete a rival from the
-- scoreboard would turn a safety tool into a ranking exploit. Blocking protects
-- the social surface; it does not rewrite the league.

create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Reverse lookup: "who blocked this user" is needed when severing follows.
create index if not exists blocked_users_blocked_idx
  on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

-- A block list is private to the person who made it. Nobody — not even the
-- blocked user — can read who blocked them, otherwise blocking invites
-- retaliation.
create policy blocked_users_select_own on public.blocked_users
  for select using (blocker_id = auth.uid());
create policy blocked_users_insert_own on public.blocked_users
  for insert with check (blocker_id = auth.uid());
create policy blocked_users_delete_own on public.blocked_users
  for delete using (blocker_id = auth.uid());

-- Comments were world-readable (comments_select_all, 20260609120000). Replace
-- that with the same rule minus authors the reader has blocked.
--
-- auth.uid() is null for anonymous readers, so `blocker_id = null` matches no
-- row, `not exists` stays true, and signed-out visitors keep seeing everything.
drop policy if exists comments_select_all on public.comments;

create policy comments_select_visible on public.comments
  for select using (
    not exists (
      select 1
      from public.blocked_users b
      where b.blocker_id = auth.uid()
        and b.blocked_id = comments.user_id
    )
  );

-- Blocking implies unfollowing, in both directions: keeping a follow edge alive
-- would keep pushing the blocked user's activity at the blocker (and vice
-- versa). Done in the database so every client gets it for free.
create or replace function public.sever_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and followee_id = new.blocked_id)
      or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

revoke execute on function public.sever_follows_on_block() from public, anon, authenticated;

create trigger blocked_users_sever_follows
  after insert on public.blocked_users
  for each row execute function public.sever_follows_on_block();

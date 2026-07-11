-- Follow system (growth §4.9/3 — design in docs/growth-features-plan.md).
-- Pure user-to-user graph: the composite primary key IS the uniqueness
-- constraint, the check blocks self-follows at the DB layer (mirrors the
-- self-vote rule), and RLS lets a user manage only their own edges.
--
-- NOT applied to production yet — the user applies migrations manually in the
-- Supabase SQL editor.

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- Follower counts filter by followee_id; the PK already covers follower_id.
create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- The graph is public (counts + who-follows-whom render on public profiles).
create policy follows_select_all on public.follows
  for select using (true);

-- A user creates/removes only their OWN outgoing edges.
create policy follows_insert_own on public.follows
  for insert with check (follower_id = auth.uid());

create policy follows_delete_own on public.follows
  for delete using (follower_id = auth.uid());

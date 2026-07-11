-- Badges (growth §4.9/2 — design in docs/growth-features-plan.md).
-- Server-granted only: no user or admin-UI path ever sets a badge directly.
-- grant_badge() is SECURITY DEFINER, callable only by service_role, and
-- idempotent (on conflict do nothing) — application code calls it freely at
-- the moment an unlock event happens, with no separate "is this the first
-- time" bookkeeping needed.

create table public.badges (
  key         text primary key,
  title       text not null,
  description text not null,
  icon        text not null
);

insert into public.badges (key, title, description, icon) values
  ('first_performance', 'First performance', 'Your first performance joined the league.', '🎤'),
  ('centurion', 'Centurion', 'One of your performances reached 100 verified votes.', '💯'),
  ('battle_champion', 'Battle champion', 'You won your first battle.', '🏆')
on conflict (key) do nothing;

create table public.profile_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_key  text not null references public.badges (key) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key)
);
create index profile_badges_user_idx on public.profile_badges (user_id);

alter table public.profile_badges enable row level security;
create policy profile_badges_select_all on public.profile_badges for select using (true);
-- NO insert/update/delete policy for any role — service_role bypasses RLS
-- and is the ONLY writer (via grant_badge, called from server code paths).

create or replace function public.grant_badge(p_user_id uuid, p_badge_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profile_badges (user_id, badge_key)
  values (p_user_id, p_badge_key)
  on conflict (user_id, badge_key) do nothing;
end;
$$;
revoke execute on function public.grant_badge(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_badge(uuid, text) to service_role;

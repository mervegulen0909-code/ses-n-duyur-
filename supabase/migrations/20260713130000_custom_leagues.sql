-- Invite-only leagues for schools, choirs and friend groups.
create table public.custom_leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 3 and 40),
  join_code  text not null unique check (join_code ~ '^[A-Z2-9]{8}$'),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.custom_league_members (
  league_id uuid not null references public.custom_leagues (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index custom_league_members_user_idx on public.custom_league_members (user_id);

alter table public.custom_leagues enable row level security;
alter table public.custom_league_members enable row level security;
-- Membership and join codes are read/written through authenticated server
-- routes. No public policy leaks every invite code through PostgREST.

create or replace function public.create_custom_league_atomic(
  p_owner_id uuid,
  p_name text,
  p_join_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (select count(*) from public.custom_leagues where owner_id = p_owner_id) >= 3 then
    raise exception 'league_limit';
  end if;
  insert into public.custom_leagues (name, join_code, owner_id)
    values (p_name, p_join_code, p_owner_id)
    returning id into v_id;
  insert into public.custom_league_members (league_id, user_id)
    values (v_id, p_owner_id);
  return v_id;
end;
$$;

revoke execute on function public.create_custom_league_atomic(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_custom_league_atomic(uuid, text, text)
  to service_role;

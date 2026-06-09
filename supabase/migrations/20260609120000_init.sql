-- VocalLeague — initial schema + RLS
-- Fairness core enforced at the DB layer:
--   * criteria_ratings can ONLY be inserted with a valid verified_listen
--   * battle_votes require a valid verified listen for BOTH sides
--   * objective score columns are writable by service_role only (no user policy)
-- RLS is enabled on EVERY table. service_role bypasses RLS (server-side writes).

-- ----------------------------------------------------------------------------
-- Helpers
-- (is_admin() is defined AFTER the tables exist — see below — because
-- check_function_bodies validates referenced tables at creation time.)
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Mirrors auth.users (Supabase manages auth.users itself).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      text unique not null,
  role        text not null default 'user' check (role in ('user', 'admin')),
  reputation  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.songs (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  artist         text,
  normalized_key text,
  created_at     timestamptz not null default now()
);

create table public.performances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  song_id          uuid references public.songs (id) on delete set null,
  source           text not null default 'youtube' check (source in ('youtube', 'upload')),
  youtube_video_id text,
  oembed_meta      jsonb,
  duration_s       integer,
  has_video        boolean not null default true,
  status           text not null default 'active' check (status in ('active', 'hidden', 'removed')),
  created_at       timestamptz not null default now()
);
create index performances_song_idx on public.performances (song_id);
create index performances_user_idx on public.performances (user_id);

-- Denormalized score row, one per performance. Written by service_role only.
create table public.scores (
  id                  uuid primary key default gen_random_uuid(),
  performance_id      uuid not null unique references public.performances (id) on delete cascade,
  scoring_version     integer not null default 1,
  initial_ai_score    numeric(5, 2),
  ai_breakdown        jsonb,
  is_provisional      boolean not null default true,
  listener_score      numeric(5, 2),
  current_score       numeric(5, 2),
  trend_score         numeric(5, 2),
  verified_vote_count integer not null default 0,
  updated_at          timestamptz not null default now()
);
create trigger scores_set_updated_at
  before update on public.scores
  for each row execute function public.set_updated_at();

create table public.verified_listens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  performance_id uuid not null references public.performances (id) on delete cascade,
  watched_pct    numeric(5, 2) not null default 0,
  events         jsonb,
  is_valid       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index verified_listens_user_perf_idx
  on public.verified_listens (user_id, performance_id);

create table public.criteria_ratings (
  id                    uuid primary key default gen_random_uuid(),
  performance_id        uuid not null references public.performances (id) on delete cascade,
  voter_id              uuid not null references public.profiles (id) on delete cascade,
  verified_listen_id    uuid not null references public.verified_listens (id) on delete cascade,
  vocal_accuracy        numeric(5, 2),
  rhythm_timing         numeric(5, 2),
  tone_quality          numeric(5, 2),
  emotion_interpretation numeric(5, 2),
  technical_skill       numeric(5, 2),
  pronunciation_diction numeric(5, 2),
  recording_quality     numeric(5, 2),
  originality           numeric(5, 2),
  stage_presence        numeric(5, 2),
  weight                numeric(6, 3) not null default 1,
  created_at            timestamptz not null default now(),
  unique (voter_id, performance_id)
);

create table public.battles (
  id         uuid primary key default gen_random_uuid(),
  song_id    uuid references public.songs (id) on delete set null,
  perf_a     uuid not null references public.performances (id) on delete cascade,
  perf_b     uuid not null references public.performances (id) on delete cascade,
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  check (perf_a <> perf_b)
);

create table public.battle_votes (
  id                  uuid primary key default gen_random_uuid(),
  battle_id           uuid not null references public.battles (id) on delete cascade,
  voter_id            uuid not null references public.profiles (id) on delete cascade,
  winner_performance_id uuid not null references public.performances (id) on delete cascade,
  listen_a_id         uuid not null references public.verified_listens (id) on delete cascade,
  listen_b_id         uuid not null references public.verified_listens (id) on delete cascade,
  is_verified         boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (battle_id, voter_id)
);

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  performance_id uuid not null references public.performances (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 4000),
  created_at     timestamptz not null default now()
);

create table public.admin_scores (
  id             uuid primary key default gen_random_uuid(),
  performance_id uuid not null references public.performances (id) on delete cascade,
  admin_id       uuid not null references public.profiles (id) on delete cascade,
  criteria       jsonb not null,
  created_at     timestamptz not null default now()
);

create table public.moderation_flags (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('performance', 'comment', 'profile')),
  target_id   uuid not null,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null,
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

create table public.dmca_requests (
  id             uuid primary key default gen_random_uuid(),
  performance_id uuid references public.performances (id) on delete set null,
  claimant       text not null,
  details        text,
  status         text not null default 'open' check (status in ('open', 'actioned', 'rejected')),
  created_at     timestamptz not null default now()
);

create table public.ratings_audit (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid,
  action     text not null,
  target     text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Auto-create a profile when a new auth user signs up.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'handle', 'user_' || substr(new.id::text, 1, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- is_admin(): SECURITY DEFINER so it can read profiles without tripping the
-- profiles RLS policies (avoids recursion). Defined here, after profiles exists.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS — enable on EVERY table
-- ----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.songs            enable row level security;
alter table public.performances     enable row level security;
alter table public.scores           enable row level security;
alter table public.verified_listens enable row level security;
alter table public.criteria_ratings enable row level security;
alter table public.battles          enable row level security;
alter table public.battle_votes     enable row level security;
alter table public.comments         enable row level security;
alter table public.admin_scores     enable row level security;
alter table public.moderation_flags enable row level security;
alter table public.dmca_requests    enable row level security;
alter table public.ratings_audit    enable row level security;

-- profiles: world-readable; users manage only their own row.
create policy profiles_select_all on public.profiles
  for select using (true);
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- songs: world-readable; any authenticated user may add a reference song.
create policy songs_select_all on public.songs
  for select using (true);
create policy songs_insert_authed on public.songs
  for insert to authenticated with check (true);
create policy songs_admin_write on public.songs
  for update using (public.is_admin()) with check (public.is_admin());

-- performances: active ones are public; owner (or admin) manages.
create policy performances_select_visible on public.performances
  for select using (status = 'active' or user_id = auth.uid() or public.is_admin());
create policy performances_insert_self on public.performances
  for insert with check (user_id = auth.uid());
create policy performances_update_owner on public.performances
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- scores: world-readable; NO user write policy → only service_role can write.
create policy scores_select_all on public.scores
  for select using (true);

-- verified_listens: a user sees and OPENS only their own. Crucially, a user
-- CANNOT self-validate: is_valid is forced false on insert and can only be
-- flipped to true by the server (service_role) after server-side anti-cheat.
create policy verified_listens_select_own on public.verified_listens
  for select using (user_id = auth.uid());
create policy verified_listens_insert_self on public.verified_listens
  for insert with check (user_id = auth.uid() and is_valid = false);
-- (no user UPDATE policy: validation is service-role only)

-- criteria_ratings: world-readable for aggregation. INSERT ONLY when the voter
-- has a VALID verified listen for THIS performance. This is the fairness core.
create policy criteria_ratings_select_all on public.criteria_ratings
  for select using (true);
create policy criteria_ratings_insert_verified on public.criteria_ratings
  for insert with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.verified_listens vl
      where vl.id = verified_listen_id
        and vl.user_id = auth.uid()
        and vl.performance_id = criteria_ratings.performance_id
        and vl.is_valid = true
    )
  );

-- battles: world-readable; created by admin/server.
create policy battles_select_all on public.battles
  for select using (true);
create policy battles_admin_insert on public.battles
  for insert with check (public.is_admin());

-- battle_votes: world-readable; require a valid verified listen for BOTH sides.
create policy battle_votes_select_all on public.battle_votes
  for select using (true);
create policy battle_votes_insert_verified on public.battle_votes
  for insert with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.verified_listens vl
      where vl.id = listen_a_id and vl.user_id = auth.uid() and vl.is_valid = true
    )
    and exists (
      select 1 from public.verified_listens vl
      where vl.id = listen_b_id and vl.user_id = auth.uid() and vl.is_valid = true
    )
  );

-- comments: world-readable; owner creates/edits/deletes own.
create policy comments_select_all on public.comments
  for select using (true);
create policy comments_insert_self on public.comments
  for insert with check (user_id = auth.uid());
create policy comments_update_self on public.comments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete_self on public.comments
  for delete using (user_id = auth.uid() or public.is_admin());

-- admin_scores: admin only (read + write).
create policy admin_scores_admin_all on public.admin_scores
  for all using (public.is_admin()) with check (public.is_admin());

-- moderation_flags: any authed user may report; only admins read/manage.
create policy moderation_flags_insert_authed on public.moderation_flags
  for insert to authenticated with check (reporter_id = auth.uid() or reporter_id is null);
create policy moderation_flags_admin_read on public.moderation_flags
  for select using (public.is_admin());
create policy moderation_flags_admin_update on public.moderation_flags
  for update using (public.is_admin()) with check (public.is_admin());

-- dmca_requests: anyone may file (public form); only admins read/manage.
create policy dmca_insert_any on public.dmca_requests
  for insert with check (true);
create policy dmca_admin_read on public.dmca_requests
  for select using (public.is_admin());
create policy dmca_admin_update on public.dmca_requests
  for update using (public.is_admin()) with check (public.is_admin());

-- ratings_audit: no user policies → service_role / admins only.
create policy ratings_audit_admin_read on public.ratings_audit
  for select using (public.is_admin());

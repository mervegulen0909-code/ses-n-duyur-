-- VoxScore launch catalog + request queue.
-- Adds controlled category/difficulty to songs, score provenance (which AI
-- provider/model produced a score), the performance_requests moderation
-- queue (normal users request additions instead of creating performances
-- directly), featured_challenges (weekly featured song), and a
-- privacy-preserving analytics_events table for the growth funnel.

-- ----------------------------------------------------------------------------
-- (a) Category + difficulty on songs (controlled values only). A
--     performance's category is its song's category — not stored per row.
-- ----------------------------------------------------------------------------
alter table public.songs
  add column category text
    check (category in ('pop','rock','rnb-soul','ballad','turkish-global',
                        'indie-alternative','musical-classical','other')),
  add column difficulty text
    check (difficulty in ('easy','medium','hard'));

-- ----------------------------------------------------------------------------
-- (b) Score provenance. Existing rows keep NULL (unknown provenance,
--     pre-provenance regime) — never backfilled with a guess.
-- ----------------------------------------------------------------------------
alter table public.scores
  add column ai_provider text
    check (ai_provider in ('anthropic','openai','mock')),
  add column ai_model text;

-- ----------------------------------------------------------------------------
-- (c) performance_requests: the moderation queue. Users can create their own
--     pending requests and read their own history. Approve/reject writes go
--     through the service role in the API only — there is no user-level
--     UPDATE policy at all, so a direct Supabase call can never flip a
--     status.
-- ----------------------------------------------------------------------------
create table public.performance_requests (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  youtube_video_id         text not null,
  youtube_url              text not null,
  category                 text not null
    check (category in ('pop','rock','rnb-soul','ballad','turkish-global',
                        'indie-alternative','musical-classical','other')),
  note                     text check (note is null or char_length(note) <= 1000),
  status                   text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewer_id              uuid references public.profiles (id) on delete set null,
  reviewed_at              timestamptz,
  rejection_reason         text,
  approved_performance_id  uuid references public.performances (id) on delete set null,
  created_at               timestamptz not null default now()
);
create index performance_requests_status_idx on public.performance_requests (status);
create index performance_requests_user_idx on public.performance_requests (user_id);
-- One PENDING request per video (approved/rejected history can repeat):
create unique index performance_requests_pending_video_unique
  on public.performance_requests (youtube_video_id) where (status = 'pending');

alter table public.performance_requests enable row level security;
-- Users: create own PENDING requests only; read own.
create policy performance_requests_insert_own on public.performance_requests
  for insert with check (user_id = auth.uid() and status = 'pending'
                         and reviewer_id is null and approved_performance_id is null);
create policy performance_requests_select_own on public.performance_requests
  for select using (user_id = auth.uid());
-- Admins: read everything.
create policy performance_requests_select_admin on public.performance_requests
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (d) featured_challenges: weekly featured song. Public read; writes are
--     service role/admin only (no user policy).
-- ----------------------------------------------------------------------------
create table public.featured_challenges (
  id         uuid primary key default gen_random_uuid(),
  song_id    uuid not null references public.songs (id) on delete cascade,
  title      text not null,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.featured_challenges enable row level security;
create policy featured_challenges_select_all on public.featured_challenges
  for select using (true);

-- ----------------------------------------------------------------------------
-- (e) analytics_events: privacy-preserving funnel tracking. No user
--     policies at all — insert via service role (API), read via admin SQL.
-- ----------------------------------------------------------------------------
create table public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null check (event in (
    'landing_view','signup_started','signup_completed',
    'performance_request_submitted','performance_request_approved',
    'verified_listen_completed','vote_submitted','battle_completed',
    'share_clicked','challenge_opened','invite_converted')),
  session_id uuid not null,
  user_id    uuid references public.profiles (id) on delete set null,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_event_time_idx on public.analytics_events (event, created_at);
alter table public.analytics_events enable row level security;

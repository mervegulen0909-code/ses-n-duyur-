# VoxScore — growth features, design-only (§4.9 items 5–10)

> Design sketches, not implementation. Each section gives a migration
> sketch, RLS shape, API surface, and UI notes — enough for a future PR to
> build directly from. None of this is built or migrated. Follow
> `docs/launch-growth-plan.md` §0 (hard rules) for every feature below:
> Zod-validate every input, RLS on every table, no client-trusted writes to
> server-managed columns.

## 1. Profile enrichment

Today `profiles` is `{ id, handle, role, reputation }` — no bio, avatar, or
links. `apps/web/src/app/profile/[handle]/page.tsx` already renders a public
creator view (performance list + battle record); enrichment adds identity
around that, not a new page.

**Migration sketch:**

```sql
alter table public.profiles
  add column bio text check (bio is null or char_length(bio) <= 500),
  add column avatar_url text,
  add column links jsonb;  -- [{ label: text, url: text }], max 5, validated by Zod not SQL
```

`avatar_url` points at Supabase Storage (a new `avatars` bucket, public-read,
owner-write) — never an arbitrary external URL rendered without a
same-origin/allowlist check (stored-XSS-via-profile risk otherwise).

**RLS:** `profiles_update_self` already exists and is column-guarded by the
`guard_profile_privileges` trigger (role/reputation are server-only) —
bio/avatar_url/links need NO new policy, they fall under the existing
"user updates their own row" grant. Storage bucket needs its own policy:
insert/update only where `auth.uid()::text = (storage.foldername(name))[1]`
(one folder per user).

**API surface:** `PATCH /api/profile` — `profileUpdateSchema` (bio, avatarUrl,
links), auth required, updates own row only (`.eq('id', user.id)`, RLS
double-enforces). Avatar upload is a direct Supabase Storage client upload
(signed URL or public bucket policy), not proxied through the API.

**UI notes:** an edit form on the profile page (own-profile only — compare
`user?.id === profile.id`), avatar picker with a client-side crop/resize
before upload (keep files small), link list capped at 5 with URL validation
(`z.string().url()`).

## 2. Badges

**Server-granted only** — no user or admin-UI path ever sets a badge
directly; they're computed and inserted by scheduled/triggered logic only
(a cron job or a DB trigger on the events that unlock them, e.g. first
performance approved, 100th verified vote received, first battle win).

**Migration sketch:**

```sql
create table public.badges (
  key         text primary key,          -- 'first_performance', 'centurion', 'battle_champion', ...
  title       text not null,
  description text not null,
  icon        text not null
);

create table public.profile_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_key  text not null references public.badges (key) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key)
);
alter table public.profile_badges enable row level security;
create policy profile_badges_select_all on public.profile_badges for select using (true);
-- NO insert/update/delete policy for any role — service_role bypasses RLS
-- and is the ONLY writer (via a granting RPC or scheduled job).

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
```

**API surface:** none writable. `GET /api/profile/[handle]/badges` (or fold
into the existing profile query) is a plain public read.

**UI notes:** a badge row/grid on the profile page, each badge a tooltip with
`title`/`description`. Empty state: nothing rendered (no "no badges yet"
guilt-tripping).

## 3. Follow system

**Migration sketch:**

```sql
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
create policy follows_select_all on public.follows for select using (true);
create policy follows_insert_own on public.follows
  for insert with check (follower_id = auth.uid());
create policy follows_delete_own on public.follows
  for delete using (follower_id = auth.uid());
```

The primary key `(follower_id, followee_id)` IS the uniqueness constraint —
no separate unique index needed. `check (follower_id <> followee_id)` blocks
self-follows at the DB layer (mirrors the self-vote rule elsewhere).

**API surface:** `POST /api/follows { followeeHandle }` (resolve handle →
id, insert AS THE USER — RLS enforces `follower_id = auth.uid()`) and
`DELETE /api/follows { followeeHandle }`. No admin surface needed — this is
pure user-to-user RLS. A follower/following COUNT can be a `select count(*)`
against `follows` filtered by `followee_id`/`follower_id`, or denormalized
onto `profiles` later if it becomes a hot path.

**UI notes:** a Follow/Unfollow button on the profile page (hidden on your
own profile), follower/following counts next to the handle. A "following"
feed (performances from followed creators) is a natural v2 but is NOT
in this sketch — keep the first cut to the graph + counts only.

## 4. Appeals

Mirrors `performance_requests`: a user submits, an admin decides, every
decision is logged. Appeals target a moderation action (a hidden
performance, a removed comment, a rejected performance request).

**Migration sketch:**

```sql
create table public.appeals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  target_type       text not null check (target_type in ('performance', 'comment', 'performance_request')),
  target_id         uuid not null,
  reason            text not null check (char_length(reason) between 10 and 2000),
  status            text not null default 'pending' check (status in ('pending', 'upheld', 'denied')),
  reviewer_id       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now()
);
create index appeals_status_idx on public.appeals (status);
alter table public.appeals enable row level security;
create policy appeals_insert_own on public.appeals
  for insert with check (user_id = auth.uid() and status = 'pending' and reviewer_id is null);
create policy appeals_select_own on public.appeals
  for select using (user_id = auth.uid());
create policy appeals_select_admin on public.appeals
  for select using (public.is_admin());
-- No user UPDATE policy — same pattern as performance_requests: only the
-- service role (via the admin API) can change status.

create table public.appeals_audit (
  id         uuid primary key default gen_random_uuid(),
  appeal_id  uuid not null references public.appeals (id) on delete cascade,
  actor      uuid references public.profiles (id) on delete set null,
  action     text not null,   -- 'submitted', 'upheld', 'denied'
  note       text,
  created_at timestamptz not null default now()
);
alter table public.appeals_audit enable row level security;
create policy appeals_audit_select_admin on public.appeals_audit
  for select using (public.is_admin());
-- Insert-only from the service role (written alongside every status change).
```

`target_id` is intentionally NOT a hard FK (same polymorphic pattern as
`moderation_flags.target_id`) — it can point at a performance, a comment, or
a performance_request depending on `target_type`.

**API surface:** `POST /api/appeals { targetType, targetId, reason }` (user,
mirrors `/api/performance-requests` exactly: schema validate → rate limit →
insert as the user). `POST /api/admin/appeals { appealId, action: 'uphold'
| 'deny', resolutionNote }` (admin gate via `getProfileForContext`, service
role update + an `appeals_audit` insert in the same request; "uphold" also
performs the actual reversal — e.g. un-hiding a performance — inside the same
handler, mirroring how approve calls `createScoredPerformance`).

**UI notes:** an "Appeal this" link wherever a moderation action is visible
to its target (a hidden-performance banner, a removed-comment placeholder),
opening a reason form. Admin queue at `/admin/appeals`, structurally
identical to `/admin/performance-requests`.

## 5. Notifications

The push **registration** side already exists and is real, not a sketch:
`push_tokens` table (migration `20260613120000_push_tokens.sql`),
`POST /api/push/register`, and `apps/mobile/src/lib/push.ts`
(`registerForPushNotifications`, `configureNotificationHandler`,
`scheduleLocalNotification` for local-only reminders). What's missing is the
**send** side — nothing currently triggers a push.

**Migration sketch (new):**

```sql
create table public.notification_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in (
    'battle_challenge', 'new_vote', 'rank_change', 'comment_reply',
    'performance_request_approved', 'performance_request_rejected'
  )),
  meta         jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notification_events_pending_idx on public.notification_events (user_id) where sent_at is null;
alter table public.notification_events enable row level security;
create policy notification_events_select_own on public.notification_events
  for select using (user_id = auth.uid());
-- Insert/update: service role only (written by the same server code paths
-- that already call trackServer(), e.g. after a vote/battle/approval).
```

**API surface:** no new user-facing endpoint — `notification_events` rows are
inserted server-side at the same call sites as the §4.8 analytics events
(e.g. right after `trackServer(service, 'vote_submitted', ...)`, also insert
a `new_vote` notification_event for the performance owner). A scheduled job
(Vercel Cron or a Supabase Edge Function on a timer) polls
`sent_at is null`, batches by user, sends via Expo's Push API
(`POST https://exp.host/--/api/v2/push/send`) against `push_tokens`, then
stamps `sent_at`. Prune `push_tokens` rows Expo reports as
`DeviceNotRegistered` in the send receipts.

**UI notes:** mobile-first (the registration infra is mobile-only today).
An in-app notification list is a v2; the v1 cut is push-only, driven by
`notification_events` + the cron sender.

## 6. Analytics dashboard

Reads `analytics_events` (§4.8) — no new table.

**API surface:** `GET /api/admin/analytics/summary?days=30` — admin-gated
(same `getProfileForContext` pattern as every other admin route), runs the
funnel-stage counts and the viral-coefficient query from
`docs/analytics.md` server-side via the service client (RLS blocks direct
client reads of `analytics_events` by design — see §4.1 migration: no user
policies at all), returns aggregated counts only, never raw event rows (no
per-user drill-down without a stronger justification — this is a growth
dashboard, not a user-activity log).

**UI notes:** `/admin/analytics` page, same admin-gate + card-grid pattern as
`/admin/page.tsx`. Cards: funnel stage counts (last 30/7/1 days), viral
coefficient, top categories by request volume. Charting library is an open
choice at build time (recharts is common in this stack) — not decided here.

## 7. Seasons

Elo/score history must never be deleted — a season boundary is a
**partition marker**, not a reset. `scripts/reset-league-data.sql` (§4.7)
remains the only way to actually clear data, and only with explicit consent.

**Migration sketch:**

```sql
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,   -- e.g. 'S1-2026', human-referenceable
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.seasons enable row level security;
create policy seasons_select_all on public.seasons for select using (true);
-- Insert/update: admin only (mirrors featured_challenges' write model).

alter table public.scores   add column season_id uuid references public.seasons (id) on delete set null;
alter table public.battles  add column season_id uuid references public.seasons (id) on delete set null;
create index scores_season_idx  on public.scores  (season_id);
create index battles_season_idx on public.battles (season_id);
```

Nullable + `on delete set null`: a season can be deleted (rare, admin
mistake correction) without cascading into score/battle history. New
rows get the CURRENT open season's id at write time (server-side, from a
small `currentSeasonId()` helper — `seasons` where `ends_at is null` or
`now() between starts_at and ends_at`), never client-supplied.

**API surface:** `POST /api/admin/seasons { title, startsAt }` closes the
previous open season (`ends_at = now()`) and opens a new one, admin-gated.
Leaderboard/standings queries gain an optional `?season=<key>` filter
(defaults to the current season); an "All-time" view is simply the
unfiltered query, which already works today.

**UI notes:** a season switcher (dropdown) on `/leaderboard` and
`/standings`, defaulting to "Current season". Past seasons stay fully
browsable — nothing about this design removes historical rankings.

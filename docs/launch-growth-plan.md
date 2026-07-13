# VoxScore — Launch & Growth Implementation Plan (Handoff)

> **Purpose:** a self-contained handoff so ANY agent (Claude, Codex, or a human)
> can continue this work without the original conversation. Read this file
> top-to-bottom before writing code. Written 2026-07-11.

## 0. Non-negotiable rules (from CLAUDE.md / AGENTS.md — re-read them first)

1. NEVER download, store, or DSP-analyze YouTube audio/video. Embed only.
2. YouTube scores are ALWAYS shown as "Provisional AI Estimate".
3. Real DSP applies ONLY to the user's own uploaded/recorded audio (the
   existing measure-and-delete flow already complies: it analyzes the user's
   own mic recording, never YouTube).
4. No vote without a completed Verified Listen (server-enforced).
5. Battle winner requires BOTH sides fully listened.
6. Zod-validate every API input. RLS stays on for every table.
7. `service_role` key server-side only.
8. **Do NOT deploy.** Deploy only when the user explicitly says "deploy et".
9. **Do NOT run destructive SQL on production.** Prepare migrations/scripts,
   report them; the user applies them via the Supabase SQL editor.
10. **NEVER invent YouTube links.** The launch catalog uses placeholders until
    the user supplies real links.
11. Do not delete or revert the concurrent session's work (see §2).

## 1. Branch / commit state at handoff

- Working branch: **`feat/launch-growth`** (off `main` @ `2d23865`).
- Commit `530099a` — "checkpoint: score integrity + native client auth" —
  preserves the concurrent Codex session's work:
  - `supabase/migrations/20260711120000_score_integrity.sql` (0–100 check
    constraints, RLS self-vote/partial-vote block, atomic
    `recompute_performance_score` RPC — service_role only). **NOT applied to
    production yet.**
  - `apps/web/src/lib/guard.ts` — authenticated native clients (Bearer +
    `x-voxscore-client: mobile-app`) bypass Turnstile botGuard;
    `guard.test.ts` covers it.
  - `/api/votes` rejects partial votes + uses the RPC; `/api/measurements`
    uses the RPC; `trendBaseline` in `packages/core/src/score-update.ts`.
  - Mobile: `native-youtube-player.tsx`, Bearer headers in `lib/api.ts`.
- **Uncommitted WIP by this session (foundation, PARTIAL — see §3):**
  - `packages/core/src/categories.ts` (NEW) — controlled category + difficulty
    enums with Zod schemas.
  - `packages/core/src/schemas.ts` — added `performanceRequestSchema`,
    `performanceRequestActionSchema`, `ANALYTICS_EVENTS` +
    `analyticsEventSchema`.
  - `packages/core/src/index.ts` — exports `./categories`.
  - `packages/core/src/adapters/scoring-provider.ts` — added
    `SCORING_VERSION = 2` (centralized), `ScoringProviderName`
    (`'anthropic' | 'openai' | 'mock'`), `ScoringResult.provider`; mock
    returns `provider: 'mock'`.
  - `packages/core/src/performance.ts` — `buildPerformanceCreate` now emits
    `scoring_version: SCORING_VERSION`, `ai_provider`, `ai_model` in the
    score payload.
  - `apps/web/src/lib/adapters/scoring.ts` — OpenAI/Anthropic providers
    return `provider: 'openai' | 'anthropic'`.

> ⚠️ **The tree does NOT typecheck right now.** `buildPerformanceCreate` emits
> `ai_provider`/`ai_model` but (a) the DB columns don't exist yet (migration
> pending, §4.1), (b) `packages/db/src/types.ts` doesn't declare them, and
> (c) `packages/core/src/performance.test.ts` may assert the old payload
> shape. Finishing §4.1 + §4.2 makes it green again. That is the very next
> step.

## 2. Files owned by the concurrent Codex session (respect, don't revert)

`apps/mobile/src/app/{add,battle}.tsx`, `apps/mobile/src/app/performance/[id].tsx`,
`apps/mobile/src/lib/{api,api.test,measure-upload}.ts`,
`apps/web/src/app/api/{votes,measurements}/route{,.test}.ts`,
`apps/web/src/lib/guard{,.test}.ts`, `packages/core/src/score-update{,.test}.ts`,
`packages/db/src/types.ts`, the score_integrity migration.
These are all in checkpoint `530099a`. Build ON them. `tmp*` files/dir in the
repo root are session junk — never commit them.

## 3. Architecture decisions already made

- **Categories** (shared const, `packages/core/src/categories.ts`):
  `pop, rock, rnb-soul, ballad, turkish-global, indie-alternative,
musical-classical, other`. Difficulties: `easy, medium, hard`.
  DB stores category on **songs** (a performance's category = its song's).
- **Provider standard:** one provider active per season
  (Anthropic preferred → OpenAI → mock). Every score row must record
  `ai_provider` + `ai_model` + `scoring_version` (centralized constant).
  Silent mock fallback records `mock` — never the configured provider.
- **Request queue replaces direct add:** normal users NEVER create
  performances; they create `performance_requests` (pending → admin
  approve/reject). `/api/performances` becomes **admin-only** (curated/seed
  path). Web `/add` and mobile add screen submit requests instead.
- **DSP:** unchanged. Measure-and-delete stays as-is (user's OWN recording,
  ADR 0003). Do not extend DSP to anything YouTube.
- **i18n:** app default EN; web (`apps/web/messages/*.json`, next-intl,
  `{var}` placeholders) and mobile (`apps/mobile/src/lib/i18n/locales/*.json`,
  i18next, `{{var}}` placeholders) each have 7 locales:
  en,tr,zh,hi,es,fr,ar. **Every new UI string needs a key in all 7 files per
  platform.** Practical approach: implement with EN+TR first, then batch-
  translate the new-keys-only snippet into the 5 other files (verify key
  parity + placeholder preservation with a node script — see
  `git log 614ad9f`/`2d23865` commit messages for the verification pattern).

## 4. Remaining work, in dependency order

### 4.1 Migration `supabase/migrations/20260711130000_launch_catalog_requests.sql` (NEXT STEP)

Single idempotent-ish migration containing:

```sql
-- (a) Category + difficulty on songs (controlled values only)
alter table public.songs
  add column category text
    check (category in ('pop','rock','rnb-soul','ballad','turkish-global',
                        'indie-alternative','musical-classical','other')),
  add column difficulty text
    check (difficulty in ('easy','medium','hard'));

-- (b) Score provenance
alter table public.scores
  add column ai_provider text
    check (ai_provider in ('anthropic','openai','mock')),
  add column ai_model text;
-- Existing rows keep NULL (unknown provenance, pre-v-provenance regime).

-- (c) performance_requests
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
-- Admins: read everything. (Approve/reject writes go through the service
-- role in the API — no user-level UPDATE policy at all, so direct Supabase
-- calls can never flip a status.)
create policy performance_requests_select_admin on public.performance_requests
  for select using (public.is_admin());

-- (d) featured_challenges (weekly featured song)
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
-- inserts: service role/admin only (no user policy).

-- (e) analytics_events (privacy-preserving; see §4.8)
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
-- No user policies at all: insert via service role (API), read via admin SQL.
```

Notes: `is_admin()` already exists (see `20260624120000_security_hardening.sql`).
**Do not apply to production** — list it in the final report alongside the
already-pending `20260711120000_score_integrity.sql`.

### 4.2 `packages/db/src/types.ts`

Add to the `Database` type: `songs.category/difficulty`,
`scores.ai_provider/ai_model`, new tables `performance_requests`,
`featured_challenges`, `analytics_events` (Row/Insert/Update shapes, matching
the existing style in that file). Then run
`pnpm --filter @voxscore/db typecheck && pnpm --filter @voxscore/core typecheck`
and fix `packages/core/src/performance.test.ts` expectations (payload now has
`ai_provider`, `ai_model`; `scoring_version` still 2). Mock provider tests may
need `provider: 'mock'` added to expected results.

### 4.3 Shared creation pipeline + APIs (web)

1. **Extract** the create-performance pipeline out of
   `apps/web/src/app/api/performances/route.ts` into
   `apps/web/src/lib/performance-create.ts`:
   `createScoredPerformance(service, { userId, youtubeUrl, category, songId? })`
   → oEmbed fetch → `getScoringProvider().score()` + `resolveSongId()`
   (move `resolveSongId` here too; set `songs.category` when creating a song)
   → insert performance (with the **service client**, explicit `user_id`)
   → insert score (now includes `ai_provider`/`ai_model`) → rollback the
   performance if the score insert fails (pattern already in the route).
   Handle 23505 (duplicate video) by throwing a typed `DuplicateVideoError`.
2. **`POST /api/performance-requests`** (new):
   auth (`getRequestContext`) → `rateLimit` → `botGuard` →
   `performanceRequestSchema` → `parseYouTubeId` → duplicate checks:
   (a) `performances.youtube_video_id` already active → 409 "already in the
   league"; (b) pending request for same video (unique index catches the
   race; pre-check for a friendly message) → 409 → insert AS THE USER
   (user-scoped client; RLS enforces `user_id = auth.uid()`) → 201 `{ id }`.
   Also **`GET`** (auth): list own requests (id, status, category,
   youtube_url, rejection_reason, created_at) for a "my requests" UI.
3. **`POST /api/admin/performance-requests`** (new): admin gate — copy the
   pattern from `/api/admin/moderate/route.ts` (`getRequestContext` +
   `getProfileForContext(ctx)?.role !== 'admin'` → 403) →
   `performanceRequestActionSchema` → load request (must be `pending`, else 409) → **reject:** service-role update
   `{status:'rejected', reviewer_id, reviewed_at, rejection_reason}` →
   **approve:** call `createScoredPerformance` with the REQUESTER's user_id
   and the request's category; on success update
   `{status:'approved', reviewer_id, reviewed_at, approved_performance_id}`;
   on `DuplicateVideoError` auto-reject with reason "duplicate video"; on any
   other failure leave the request `pending` and return 502 (NEVER leave a
   scoreless performance — the pipeline's rollback guarantees this).
   Log `performance_request_approved` analytics event on success (§4.8).
4. **Repoint `/api/performances`** to admin-only: after auth, check
   `getProfileForContext(ctx)?.role === 'admin'`, else 403 with
   `error: 'Submissions go through the request queue'` so old clients get a
   clear message. Keep everything else (it becomes the curated/seed path).
   Update its route tests accordingly (non-admin now 403).
5. **`POST /api/analytics`** (new): `analyticsEventSchema` → rate limit
   (per session/IP) → service-role insert (attach `user_id` from
   `getRequestContext` IF present — endpoint must also work signed-out,
   e.g. `landing_view`). No GET.
6. **`/api/battles/next`:** read the current route first. Add optional
   `songId` (uuid) to its input schema: when present, pair ONLY performances
   of that song; if fewer than 2 active same-song performances exist return
   404 `{ error: 'Not enough performances for this challenge yet' }`.
   Global (no songId) behavior unchanged. This powers challenge pages.

### 4.4 Web UI

- **`/add` page + `add-performance-form.tsx`:** convert to a REQUEST form —
  YouTube URL + category select (from `SONG_CATEGORIES`, translated labels) +
  optional note + submit → POST `/api/performance-requests` → success state
  "Talebin sırada / Your request is in the review queue" with request id.
  NO impression that the video is instantly in the league. Add a small
  "My requests" list (GET) with status badges.
- **`/admin/performance-requests` page + dashboard card on `/admin`:**
  list pending (service/user client via admin RLS select policy is fine for
  reads) with: embedded video link (plain `<a>` to YouTube — do NOT embed all
  of them, one click-out link each), requester handle, category, note, date.
  Approve button; Reject button with a required reason input. Wire to the
  admin API. Follow the existing `/admin/moderation` page's structure/styles.
- **Viral/share pack (performance detail + song page):**
  - `share-buttons.tsx` client component: Copy link, WhatsApp
    (`https://wa.me/?text=`), X (`https://twitter.com/intent/tweet?text=&url=`),
    native `navigator.share` when available. Fires `share_clicked` analytics.
  - Challenge CTA: "Arkadaşını bu düelloya çağır" linking to
    `/song/[id]?challenge=1` (and battle CTA on the song page).
  - `apps/web/src/app/performance/[id]/opengraph-image.tsx` — dynamic OG
    image (Next `ImageResponse`): song title, score, rank-ish context,
    "Provisional AI Estimate" badge. Also `generateMetadata` on the
    performance page: title = `{songTitle} — {score} on VoxScore`.
  - Share pages must render signed-out (they already do — verify no auth
    gate on performance/song pages; login is only required for listen/vote/battle).
- **Score transparency (performance detail):** show Current Score, AI Start,
  Listener Score, Verified Vote Count, Trend, Provisional badge (exists),
  Measured caption (exists), plus a **confidence hint** derived from vote
  count (0 votes = "AI estimate only", 1–9 = "early votes", 10+ = "community
  confirmed" — thresholds in `packages/scoring` or a small helper with
  tests). Leaderboard rows: show `verified_vote_count` and visually separate
  0-vote provisional rows (e.g. muted score color) from voted rows.
- **Discovery/empty states (home + leaderboard):** sections for Featured
  challenge (latest `featured_challenges` row w/ its song), Trending (top by
  `verified_vote_count` last N), Newest approved, Category cards (8 chips →
  filtered leaderboard), CTAs: "Start a challenge", "Submit a performance
  request", "Invite a friend" (share link). When the catalog is EMPTY, never
  render a bare "no performances" — render the CTA block instead.
  Leaderboard: search by song/artist (client-side filter over fetched rows is
  fine at launch scale), category filter (`?category=`), sort presets
  (top score / most battles / newest).

### 4.5 Mobile (Expo)

- `lib/api.ts`: add `submitPerformanceRequest(url, category, note?)` →
  POST `/api/performance-requests` (authedPost already exists and sends
  Bearer + native header) and `myPerformanceRequests()` (GET wrapper —
  note: `authedPost` is POST-only; add an `authedGet`).
- `app/add.tsx`: convert to the request form (category picker from
  `SONG_CATEGORIES` — mirror constants or import from `@voxscore/core`
  which mobile already depends on; success state = "in review queue",
  do NOT navigate to a performance page). Keep the codex session's error
  mapping style. i18n: this file is not yet translated — add a `Request`
  namespace to `apps/mobile/src/lib/i18n/locales/*.json` (all 7) and wire
  `useTranslation()` here (pattern: see `app/login.tsx`).
- Remaining mobile i18n follow-up (battle.tsx, performance/[id].tsx, api.ts
  error strings) can ride along if time allows — they were deliberately
  skipped in PR #32 because the codex session was editing them; they are now
  checkpointed, so it's safe.
- Locale note: **all 7 mobile locale files exist and mobile typecheck is
  green** (verified 2026-07-11). The "missing ar/es/fr/hi/zh" report was
  stale — do not recreate them; just ADD new keys to all 7.

### 4.6 Launch catalog seed (NO fake links)

- `supabase/seed/launch-catalog.template.json`: 19 songs — each
  `{ title, artist, category, difficulty, performances: [{ youtubeUrl: null,
note: "REPLACE with real link 1" }, { youtubeUrl: null, note: "REPLACE
with real link 2" }] }`. Balanced: ~3 songs per non-`other` category
  (7 categories × ~3 ≈ 19–21; pick 19), difficulties spread ~6/7/6.
  Song titles/artists MAY be real well-known songs (that's metadata, not
  links) — but leave `youtubeUrl` null everywhere.
- `scripts/seed-launch-catalog.ts`: reads the template, REFUSES to run if
  any `youtubeUrl` is null, otherwise calls `/api/performances` (admin/seed
  path) or inserts via service client directly. Env-driven
  (`SUPABASE_URL`+`SERVICE_ROLE_KEY` from env, never hardcoded).
- Vitest `launch-catalog.test.ts`: template has exactly 19 songs, ≥2
  performance slots each (≥38 total), valid categories/difficulties, balanced
  category counts (each used ≥2), difficulty spread (each level ≥5).
- **Final report must ask the user for the 38 real YouTube links** (2 per
  song, listing the 19 chosen songs).

### 4.7 Cleanup script (do NOT run)

`scripts/reset-league-data.sql` — documented, ordered deletes for a fresh
launch: `battle_votes, battles, criteria_ratings, verified_listens,
measured_scores, comments, moderation_flags(performance-scoped),
performance_requests, scores, performances` (respect FK order; songs kept or
optionally cleared — document both). Header comment: production use requires
explicit user consent + they run it in the SQL editor themselves.

### 4.8 Analytics wiring

- `apps/web/src/lib/analytics.ts` (client): `track(event, meta?)` — lazy
  random session UUID in `localStorage`, `navigator.sendBeacon`/fetch to
  `/api/analytics`, no-ops on error. Server-side helper for API routes
  (`trackServer(service, event, userId?, meta?)` direct insert).
- Wire: `landing_view` (home page client component), `signup_started/
completed` (login page), `performance_request_submitted` (request API),
  `performance_request_approved` (admin API), `verified_listen_completed`
  (listens/complete route), `vote_submitted` (votes route),
  `battle_completed` (battles/vote route), `share_clicked` (share buttons),
  `challenge_opened` (song page with `?challenge=1`), `invite_converted`
  (signup with `?ref=` param → meta.ref).
- Doc `docs/analytics.md`: funnel definition + the viral coefficient query
  (invite_converted per share_clicked / signups per invite).

### 4.9 EK growth features — priority & scope

Implement now (in this order) if capacity allows, else leave designed:

1. **Shareable score card** = §4.4 viral pack (OG image + share buttons). DO.
2. **Weekly challenge** = `featured_challenges` + home section + song page
   challenge mode + `songId`-scoped battles (§4.3.6). DO (basic).
3. **Empty states/onboarding** = §4.4 discovery. DO.
4. **Search/filter** = §4.4 leaderboard. DO (basic).
   5–10. **Profile enrichment, badges, follow system, appeals, notifications,
   analytics dashboard** — PLAN ONLY for now: write
   `docs/growth-features-plan.md` with per-feature migration sketch + RLS +
   API surface + UI notes (badges MUST be server-granted only; follows need
   unique constraint (follower_id, followee_id) + RLS; appeals mirror
   performance_requests pattern with audit log table; notifications reuse
   Expo push infra in `apps/web/src/lib/push.ts` if present / mobile
   `lib/push.ts`). Seasons: add `season_id` design (nullable on
   scores/battles, `seasons` table) — archive by season key, never delete
   Elo/score history.

### 4.10 Tests (Vitest; follow existing route-test patterns)

Request API: 401 unauth; 422 invalid URL; 422 invalid category; 409 duplicate
video (existing performance); 409 duplicate pending request; 201 happy path
(user insert). Admin API: 403 non-admin (both approve and reject); approve
creates performance + score atomically (mock service client — pattern in
`performances/route.test.ts`); approve failure leaves request pending and no
orphan performance; reject stores reason; approving a non-pending request → 409. `/api/performances`: non-admin 403 (bypass blocked); admin 201.
Analytics: 422 bad event; 201 anon + authed. Battles: songId with <2
same-song performances → 404. Catalog template validation (§4.6). Confidence
helper unit tests. DO NOT break existing scoring/battle/listen tests — run
the full suite.

### 4.11 Gates & final report

```
pnpm test
pnpm typecheck            # full workspace — must be green
pnpm --filter @voxscore/web build
supabase db lint / db reset  # ONLY if Docker Desktop is running; else report "Docker unavailable, SQL not machine-validated"
```

Final report must list: changed files; test/typecheck/build results;
remaining risks; **migrations pending production application** (at minimum
`20260711120000_score_integrity.sql` + `20260711130000_launch_catalog_requests.sql`);
the 19-song list with a request for 38 real YouTube links; explicit note that
NOTHING was deployed.

## 5. Environment pitfalls (learned this session — will bite you)

- Windows + Git Bash: heredocs corrupt Turkish characters — write JSON/i18n
  files with the Write tool or node scripts, never `cat <<EOF`.
- LF/CRLF warnings on every git add are normal here; ignore.
- New Expo routes break typed-routes → run `npx expo customize tsconfig.json`
  if `app/` gains a new route file.
- `vercel --prod` must run from the REPO ROOT (root vercel.json defines
  pnpm/monorepo build) — but again: NO deploy without explicit user consent.
- gh pushes need `gh auth switch --user arfglnddyma-199385`.
- `pnpm test` runs from root (vitest workspace); mobile is typecheck+lint only.
- The web dev server may already be running on :3001 from another session.
- Supabase migrations on this project are applied MANUALLY by the user in the
  SQL editor (no ledger); never `supabase db push` against production.

# VoxScore analytics

Privacy-preserving product analytics: `session_id` is a client-generated
random UUID stored in `localStorage`, never a tracking cookie or fingerprint.
`meta` never contains personal data or YouTube media data — only ids and
enum-ish strings. Events are write-only from the client's perspective: there
is no `GET /api/analytics` and no client-facing read of `analytics_events` —
the table is queried directly via admin SQL only.

## Ingest paths

- **Client** — `apps/web/src/lib/analytics.ts`'s `track(event, meta?)`.
  Lazily creates/reuses the session id, then `navigator.sendBeacon` (falls
  back to `fetch` with `keepalive: true`) to `POST /api/analytics`. Never
  throws — a dropped event must not break the feature that fired it.
- **Server** — `apps/web/src/lib/analytics-server.ts`'s
  `trackServer(service, event, userId?, meta?)`. Used inside API routes for
  actions that don't have a client `track()` call to piggyback on (a vote,
  listen, or battle result is decided server-side). Generates its own
  `session_id` since there is no client-persisted session at that layer —
  these events join on `user_id` instead.

## Event catalog

| Event | Fired from | Notes |
|---|---|---|
| `landing_view` | Home page (`TrackLandingView`), on mount | Signed-out capable |
| `signup_started` | Login page, submitting in signup mode | |
| `signup_completed` | Login page, signup succeeds | |
| `performance_request_submitted` | `POST /api/performance-requests` | `meta.category` |
| `performance_request_approved` | `POST /api/admin/performance-requests` (approve) | attributed to the **requester**, not the admin |
| `verified_listen_completed` | `POST /api/listens/complete`, only when `isValid` | `meta.performanceId` |
| `vote_submitted` | `POST /api/votes`, on success | `meta.performanceId` |
| `battle_completed` | `POST /api/battles/vote`, on success | `meta.battleId` |
| `share_clicked` | `ShareButtons` / `InviteFriendCard`, any channel click | `meta.channel` (`copy`, `whatsapp`, `x`, `native`, `invite_card`) |
| `challenge_opened` | Song page, `?challenge=1` (`ChallengeSection`), on mount | `meta.songId` |
| `invite_converted` | Login page, signup succeeds with a `?ref=` param | `meta.ref` |

## Funnel definition

The core growth loop, in order:

```
landing_view
  -> signup_started -> signup_completed
  -> performance_request_submitted -> performance_request_approved
  -> verified_listen_completed -> vote_submitted / battle_completed
  -> share_clicked -> challenge_opened -> invite_converted
```

Not every session passes through every stage in order — e.g. a signed-in
user can go straight from `landing_view` to `vote_submitted` without ever
submitting a request. Treat the list as available stages to measure
conversion between, not a strict linear path every user takes.

## Viral coefficient query

Invites converted per share click, and signups attributable to an invite:

```sql
-- Share -> invite conversion rate.
select
  count(*) filter (where event = 'invite_converted') as invites_converted,
  count(*) filter (where event = 'share_clicked') as shares_clicked,
  round(
    count(*) filter (where event = 'invite_converted')::numeric
      / nullif(count(*) filter (where event = 'share_clicked'), 0),
    4
  ) as invite_conversion_rate
from public.analytics_events
where created_at >= now() - interval '30 days';

-- Signups that came in via a ref link (viral coefficient numerator).
select
  count(*) filter (where event = 'signup_completed') as total_signups,
  count(*) filter (where event = 'invite_converted') as ref_signups,
  round(
    count(*) filter (where event = 'invite_converted')::numeric
      / nullif(count(*) filter (where event = 'signup_completed'), 0),
    4
  ) as viral_coefficient
from public.analytics_events
where created_at >= now() - interval '30 days';
```

## Rate limiting

Analytics events use their own limiter (`analyticsRateLimit` in
`apps/web/src/lib/guard.ts`, 120/min/key) — separate from the 20/min write
limiter used for league mutations, so normal usage (page views, share
clicks) never trips the mutation budget.

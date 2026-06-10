# VocalLeague — Store Privacy Disclosures (Apple Privacy Labels + Google Data Safety)

> **STATUS: DRAFT, code-derived.** This document maps what the app *actually*
> stores/collects (from the Supabase schema + API routes + mobile client) to the
> categories each store's privacy form requires. It is an engineering inventory,
> **not legal advice** — a human must verify completeness and category choices
> against current Apple/Google policy and our published Privacy Policy
> (`apps/web/src/app/privacy/page.tsx`) before submitting. (CLAUDE.md: "If unsure,
> say I cannot verify — do not guess laws." I cannot verify legal sufficiency.)
>
> Maps to: native-app-plan.md §4, §7 (privacy labels / Data Safety), N4.

## 1. Source of truth — what we collect

Derived from `supabase/migrations/20260609120000_init.sql`,
`20260609130000_battle_and_realtime.sql`, the `apps/web/src/app/api/*` routes, and
the mobile client (`apps/mobile/src/lib/*`).

| Data | Where stored | Purpose | Linked to user? | Public? |
| --- | --- | --- | --- | --- |
| **Email address** | `auth.users` (Supabase Auth) | Account creation, sign-in | Yes | No |
| **Handle / username** | `profiles.handle` | Public display name, attribution | Yes | **Yes** (`profiles_select_all`) |
| **Reputation** (integer) | `profiles.reputation` | Gamification | Yes | Yes |
| **Performances** (YouTube video id, oEmbed title/author metadata) | `performances` | Core feature (submitted content) | Yes | Yes when `status='active'` |
| **Comments** (free text) | `comments.body` | Social feature | Yes | Yes |
| **Votes / criterion ratings** | `criteria_ratings`, `battle_votes` | Scoring, fairness | Yes | Aggregated publicly |
| **Verified-listen events** (watch %, IFrame player events) | `verified_listens.events`, `.watched_pct` | Anti-cheat (Verified Listen → Verified Vote) | Yes | Owner-only (`select_own`) |
| **Moderation reports filed** | `moderation_flags.reporter_id` | Trust & safety | Yes (until deletion → SET NULL) | Admin-only |
| **Push token** *(planned, N3 — not yet in schema)* | `push_tokens` (design sketch in `push.ts`) | Deliver push notifications | Yes | No |
| **Device attestation token** *(planned, N2 — App Attest / Play Integrity)* | Verified server-side, **not persisted** | Bot/abuse prevention | Transient | No |
| **IP address** | Not stored by app; seen by Vercel/Upstash infra | Rate-limiting, security, abuse | Infra-level | No |

**Critically NOT collected** (lead with this — see native-app-plan.md §7):
- ❌ No YouTube audio/video download, cache, or DSP analysis (embed only — Hard Rule 1).
- ❌ No device fingerprinting (GDPR — native-app-plan.md §7).
- ❌ No advertising identifiers, no ad SDKs, no cross-app tracking.
- ❌ No location, contacts, photos, microphone, or camera access.
- ❌ No third-party analytics today (Sentry is *optional/future* — disclose only if added).
- ❌ No data sold or shared with third parties for their own use.

## 2. Apple — App Privacy "nutrition label"

Per data type → (Collected? · Linked to identity? · Used for tracking? · Purposes).
**Tracking = NO across the board** (no IDFA, no cross-app/3rd-party tracking).

| Apple category | Type | Collected | Linked | Tracking | Purpose |
| --- | --- | --- | --- | --- | --- |
| Contact Info | Email Address | Yes | Yes | No | App Functionality (auth) |
| Identifiers | User ID (handle/`profiles.id`) | Yes | Yes | No | App Functionality |
| Identifiers | Device ID (push token) *(when N3 ships)* | Yes | Yes | No | App Functionality (notifications) |
| User Content | Other (performances, comments, votes) | Yes | Yes | No | App Functionality |
| Usage Data | Product Interaction (listen/vote activity) | Yes | Yes | No | App Functionality |
| *(Security)* | IP-based abuse prevention | infra | — | No | Fraud/abuse prevention, App Functionality |

> If/when device attestation or any diagnostics SDK is added, revisit
> "Diagnostics" and fraud-prevention disclosures.

## 3. Google Play — Data Safety form

| Google category → type | Collected | Shared | Processed ephemerally | Required? | Purpose |
| --- | --- | --- | --- | --- | --- |
| Personal info → Email address | Yes | No | No | Required (account) | Account management |
| Personal info → User IDs (handle) | Yes | No | No | Required | Account management, App functionality |
| App activity → In-app actions (votes, listens) | Yes | No | No | Required | App functionality |
| App activity → User-generated content (perf., comments) | Yes | No | No | Required | App functionality |
| Device or other IDs → Push token *(N3)* | Yes | No | No | Optional | App functionality (notifications) |
| App info & performance → *(none today)* | No | — | — | — | — |

- **Data encrypted in transit:** Yes (HTTPS only — matches
  `app.json` `ios.config.usesNonExemptEncryption=false`).
- **Users can request data deletion:** **Yes** — in-app account deletion
  (Profile → Delete account → `POST /api/account/delete`) plus a deletion URL if
  required. See §4.
- **Committed to Play Families policy / not directed at children:** confirm age rating.

## 4. Account deletion & data retention (implemented)

In-app deletion satisfies **Apple Guideline 5.1.1(v)** and **Google Play**'s
account-deletion requirement.

- **Entry point:** mobile Profile screen → "Delete account" (destructive confirm)
  → `apps/mobile/src/lib/api.ts deleteAccount()` → `POST /api/account/delete`.
- **Server:** `apps/web/src/app/api/account/delete/route.ts` deletes **only the
  authenticated user** (`getRequestContext` user id, never a body id) via
  `auth.admin.deleteUser`. A single call removes all owned data by DB cascade.
- **What is erased (ON DELETE CASCADE from `profiles`):** profile, performances,
  scores, verified_listens, criteria_ratings, battle_votes, comments,
  admin_scores, and any battles referencing the user's performances.
- **What is retained but de-identified (legal / audit):**
  - `moderation_flags.reporter_id` → **SET NULL** (the report survives, reporter anonymized).
  - `dmca_requests.performance_id` → **SET NULL** (filing survives; `claimant` is a third party, not the deleted user).
  - `ratings_audit` (incl. an `account_deleted` row) → no FK, retained; `actor`/`target` are the now-orphaned uuid only.
- **Email** lives in `auth.users` and is removed by `deleteUser`.
- *(Verified independently against the migration on 2026-06-10.)*

> **Open item:** Google Play also wants a **web-accessible deletion URL** (for
> users without the app). Consider a `/account/delete` web page or a documented
> support path, and confirm whether our retained audit rows are acceptable under
> our Privacy Policy's stated retention period.

## 5. Pre-submission checklist (privacy)

- [ ] Privacy Policy URL live and linked **in-app** (currently web-only:
      `/privacy`, `/terms`, `/dmca`) — mobile must surface these links (N4).
- [ ] Apple privacy label entered in App Store Connect to match §2.
- [ ] Google Data Safety form entered in Play Console to match §3.
- [ ] Web deletion URL or documented path for Play (see §4 open item).
- [ ] Re-audit this doc whenever a new data type, SDK, or table is added
      (push tokens N3, attestation N2, any analytics).
- [ ] Confirm YouTube embed + watch-progress logging ToS for native
      (native-app-plan.md §7 — verify with YouTube Dev Relations).

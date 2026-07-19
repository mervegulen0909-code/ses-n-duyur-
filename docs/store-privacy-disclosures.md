# VoxScore — Store Privacy Disclosures (Apple Privacy Labels + Google Data Safety)

> **STATUS: DRAFT, code-derived.** This document maps what the app _actually_
> stores/collects (from the Supabase schema + API routes + mobile client) to the
> categories each store's privacy form requires. It is an engineering inventory,
> **not legal advice** — a human must verify completeness and category choices
> against current Apple/Google policy and our published Privacy Policy
> (`apps/web/src/app/privacy/page.tsx`) before submitting. (CLAUDE.md: "If unsure,
> say I cannot verify — do not guess laws." I cannot verify legal sufficiency.)
>
> Maps to: native-app-plan.md §4, §7 (privacy labels / Data Safety), N4.
>
> Re-audited 2026-07-19 against current code: push tokens are implemented (were
> marked "planned"), microphone access for the user's own "Measured" recording
> was undisclosed (now documented), and the web deletion URL open item is resolved.

## 1. Source of truth — what we collect

Derived from `supabase/migrations/20260609120000_init.sql`,
`20260609130000_battle_and_realtime.sql`, the `apps/web/src/app/api/*` routes, and
the mobile client (`apps/mobile/src/lib/*`).

| Data                                                              | Where stored                                                                                                                                                      | Purpose                                                        | Linked to user?                                                        | Public?                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| **Email address**                                                 | `auth.users` (Supabase Auth)                                                                                                                                      | Account creation, sign-in                                      | Yes                                                                    | No                              |
| **Handle / username**                                             | `profiles.handle`                                                                                                                                                 | Public display name, attribution                               | Yes                                                                    | **Yes** (`profiles_select_all`) |
| **Reputation** (integer)                                          | `profiles.reputation`                                                                                                                                             | Gamification                                                   | Yes                                                                    | Yes                             |
| **Performances** (YouTube video id, oEmbed title/author metadata) | `performances`                                                                                                                                                    | Core feature (submitted content)                               | Yes                                                                    | Yes when `status='active'`      |
| **Comments** (free text)                                          | `comments.body`                                                                                                                                                   | Social feature                                                 | Yes                                                                    | Yes                             |
| **Votes / criterion ratings**                                     | `criteria_ratings`, `battle_votes`                                                                                                                                | Scoring, fairness                                              | Yes                                                                    | Aggregated publicly             |
| **Verified-listen events** (watch %, IFrame player events)        | `verified_listens.events`, `.watched_pct`                                                                                                                         | Anti-cheat (Verified Listen → Verified Vote)                   | Yes                                                                    | Owner-only (`select_own`)       |
| **Moderation reports filed**                                      | `moderation_flags.reporter_id`                                                                                                                                    | Trust & safety                                                 | Yes (until deletion → SET NULL)                                        | Admin-only                      |
| **Push token**                                                    | `push_tokens` table, registered via `POST /api/push/register`, consumed by the `send-notifications` cron                                                          | Deliver push notifications                                     | Yes                                                                    | No                              |
| **Microphone audio** (only for a user's own "Measured" recording) | Captured on-device, sent once to `POST /api/measurements`, analyzed in memory and never written to disk/storage/logs (ADR 0003) — only numeric sub-scores persist | Real vocal measurement for the user's own upload (Hard Rule 3) | No (raw audio is discarded; scores are tied to the performance)        | No                              |
| **Device attestation token** _(App Attest / Play Integrity)_      | Verified server-side; challenge/key metadata and monotonic counters are persisted, assertion tokens are not                                                       | Bot/abuse prevention                                           | Challenge/key records retained with account; assertion token transient | No                              |
| **IP address**                                                    | Not stored by app; seen by Vercel/Upstash infra                                                                                                                   | Rate-limiting, security, abuse                                 | Infra-level                                                            | No                              |

**Critically NOT collected** (lead with this — see native-app-plan.md §7):

- ❌ No YouTube audio/video download, cache, or DSP analysis (embed only — Hard Rule 1).
- ❌ No device fingerprinting (GDPR — native-app-plan.md §7).
- ❌ No advertising identifiers, no ad SDKs, no cross-app tracking.
- ❌ No location, contacts, photos, or camera access.
- ❌ Microphone is used ONLY when a user explicitly starts a "Measured" recording of
  their own performance — never in the background, never for YouTube-embedded content
  (Hard Rule 1/3). Raw audio is discarded immediately after analysis (see the
  Microphone row above — this is a disclosed permission, not an omission).
- ❌ No third-party analytics today (Sentry is _optional/future_ — disclose only if added).
- ❌ No data sold or shared with third parties for their own use.

## 2. Apple — App Privacy "nutrition label"

Per data type → (Collected? · Linked to identity? · Used for tracking? · Purposes).
**Tracking = NO across the board** (no IDFA, no cross-app/3rd-party tracking).

| Apple category | Type                                              | Collected | Linked | Tracking | Purpose                                                |
| -------------- | ------------------------------------------------- | --------- | ------ | -------- | ------------------------------------------------------ |
| Contact Info   | Email Address                                     | Yes       | Yes    | No       | App Functionality (auth)                               |
| Identifiers    | User ID (handle/`profiles.id`)                    | Yes       | Yes    | No       | App Functionality                                      |
| Identifiers    | Device ID (push token)                            | Yes       | Yes    | No       | App Functionality (notifications)                      |
| Sensitive Info | Audio Data (own-recording "Measured" upload only) | Yes       | Yes    | No       | App Functionality — analyzed then discarded (ADR 0003) |
| User Content   | Other (performances, comments, votes)             | Yes       | Yes    | No       | App Functionality                                      |
| Usage Data     | Product Interaction (listen/vote activity)        | Yes       | Yes    | No       | App Functionality                                      |
| _(Security)_   | IP-based abuse prevention                         | infra     | —      | No       | Fraud/abuse prevention, App Functionality              |

> If any diagnostics SDK is added, revisit
> "Diagnostics" and fraud-prevention disclosures.

## 3. Google Play — Data Safety form

| Google category → type                                  | Collected | Shared | Processed ephemerally          | Required?                 | Purpose                               |
| ------------------------------------------------------- | --------- | ------ | ------------------------------ | ------------------------- | ------------------------------------- |
| Personal info → Email address                           | Yes       | No     | No                             | Required (account)        | Account management                    |
| Personal info → User IDs (handle)                       | Yes       | No     | No                             | Required                  | Account management, App functionality |
| App activity → In-app actions (votes, listens)          | Yes       | No     | No                             | Required                  | App functionality                     |
| App activity → User-generated content (perf., comments) | Yes       | No     | No                             | Required                  | App functionality                     |
| Device or other IDs → Push token                        | Yes       | No     | No                             | Optional                  | App functionality (notifications)     |
| Audio → Voice or sound recordings (own upload only)     | Yes       | No     | Yes (analyzed, then discarded) | Optional (feature opt-in) | App functionality (Measured scoring)  |
| App info & performance → _(none today)_                 | No        | —      | —                              | —                         | —                                     |

- **Data encrypted in transit:** Yes (HTTPS only — matches
  `app.json` `ios.config.usesNonExemptEncryption=false`).
- **Users can request data deletion:** **Yes** — in-app account deletion
  (Profile → Delete account → `POST /api/account/delete`) **and** the web
  deletion URL `https://voxscore.app/account/delete` (same server endpoint,
  reachable without installing the app). See §4.
- **Committed to Play Families policy / not directed at children:** confirm age rating.

## 4. Account deletion & data retention (implemented)

In-app deletion satisfies **Apple Guideline 5.1.1(v)** and **Google Play**'s
account-deletion requirement.

- **Entry points:**
  - Mobile Profile screen → "Delete account" (destructive confirm)
    → `apps/mobile/src/lib/api.ts deleteAccount()` → `POST /api/account/delete`.
  - Web `https://voxscore.app/account/delete` (`apps/web/src/app/account/delete/page.tsx`)
    → same two-step confirm pattern → same `POST /api/account/delete`. Satisfies
    Google Play's web-accessible deletion URL requirement without a separate
    server implementation.
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
- _(Verified independently against the migration on 2026-06-10.)_

> **Resolved (2026-07-19):** the web-accessible deletion URL now exists at
> `/account/delete`. Retained audit rows (moderation/DMCA, anonymized) match
> the retention language in the Privacy Policy's "Data retention" section —
> no further action needed unless that policy text changes.

## 5. Pre-submission checklist (privacy)

- [x] Privacy Policy URL live and linked **in-app** — mobile Profile screen
      surfaces Terms/Privacy/DMCA via `LegalLinks` (`apps/mobile/src/components/legal-links.tsx`),
      opened in the in-app browser, visible to signed-in and signed-out users.
- [ ] Apple privacy label entered in App Store Connect to match §2 (human: App Store Connect form entry).
- [ ] Google Data Safety form entered in Play Console to match §3 (human: Play Console form entry).
- [x] Web deletion URL for Play — `https://voxscore.app/account/delete` (see §4).
- [ ] Re-audit this doc whenever a new data type, SDK, or table is added.
- [ ] Confirm YouTube embed + watch-progress logging ToS for native
      (native-app-plan.md §7 — verify with YouTube Dev Relations).

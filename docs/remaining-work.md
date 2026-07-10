# VoxScore — Remaining Work (Store Launch)

> Status as of **2026-07-10**, after the multi-agent audit cycle (PR #17/#18/#19,
> main `6e82e0b`). Code-side work is DONE: all quality gates green
> (typecheck 0 · lint 0 · 286/286 unit · 16/16 e2e), the security migrations are
> applied AND verified on the live DB, web is deployed to production, and the
> audit-fix APK is verified on-device. What remains is operational/human work,
> plus two consciously deferred engineering items.

## 1. Store submission (operational — blocks launch)

- [ ] **Production builds.** Everything shipped so far is a `preview` APK.
      Stores need: `eas build --profile production --platform android` (AAB) and,
      for iOS, an Apple Developer account + `--platform ios`. Profile already
      exists in `apps/mobile/eas.json`.
- [ ] **Google Play Console** account + app listing: screenshots, descriptions
      (EN/TR), category, content rating questionnaire, **Data Safety form** —
      declare exactly what `/privacy` now discloses: account data (email,
      handle), submitted YouTube links + public metadata, votes/listen events,
      comments, Expo push tokens (device platform), no ads, no sale of data.
- [ ] **App Store Connect** (if iOS ships): same listing work + privacy
      nutrition labels; `usesNonExemptEncryption` is already set false.
- [ ] **In-app account deletion** (required by both stores) already works from
      Profile — verified on-device 2026-07-10. Just declare it in the forms.

## 2. Legal (strongly recommended before launch)

- [ ] The `/privacy` and `/terms` pages are now complete, dated
      ("Last updated: July 10, 2026"), and match actual data flows — but they
      were **not reviewed by a lawyer**. Have counsel review both before store
      submission (the audit rated the old "Draft" placeholder a store-rejection
      trigger; the placeholder is gone, professional review remains prudent).
- [ ] **Add a real privacy-contact email** to `/privacy` ("Your rights"
      section currently routes everything through the takedown form). Play
      Console also asks for a support email — decide which address to publish.

## 3. Deferred audit findings (conscious decisions — revisit post-launch)

- [ ] **Non-atomic vote-score recompute** (`apps/web/src/app/api/votes/route.ts`,
      LOW): concurrent votes on the same performance can lose one aggregate
      update; the next vote self-heals it. Proper fix = a SECURITY DEFINER SQL
      RPC, but that would duplicate the TS scoring math (`packages/core`
      `recomputeScore`) in SQL — divergence risk outweighed a low-severity race
      at launch scale. Revisit when vote volume grows.
- [ ] **15s Verified-Listen floor vs sub-15s videos**
      (`packages/core/src/listen.ts` `MIN_VERIFIED_LISTEN_SECONDS`): a genuinely
      sub-15s performance can be added but never verified/voted. Kept as-is:
      lowering the floor from client-reported duration would weaken the
      anti-cheat (the server cannot trust client duration). Fix properly by
      fetching trusted durations (YouTube Data API key) — see the note in
      `listen.ts` — or reject sub-15s at add time as a product decision.
- [ ] **Native single-vote is Turnstile-gated** (`/api/votes` botGuard): the
      app now shows an honest message ("voting from the app unlocks once device
      attestation ships"); battle voting works natively. Ship **App Attest /
      Play Integrity** (plan N2b) to enable native single-votes.

## 4. Infrastructure hygiene (won't block launch, will bite later)

- [ ] **Apply `20260710150000_measured_scores.sql` to the live DB** (SQL
      editor, like every migration here). Until it runs, `/api/measurements`
      returns 500 on store and the performance page simply shows no
      "Measured" badges (reads fail soft). See ADR 0003.
- [ ] **Rotate the Supabase `service_role` secret.** The current secret was
      briefly exposed as an env-var _name_ in Vercel (deleted 2026-07-10, but
      it appeared in dashboards/screens). Rotate in Supabase → update
      `SUPABASE_SERVICE_ROLE_KEY` in Vercel (project `web`) → redeploy.
- [ ] **Migration ledger doesn't exist on the live DB** — migrations have been
      applied by hand via the SQL editor, so `supabase_migrations.schema_migrations`
      is empty/absent and `supabase db push` would try to re-apply everything.
      Either keep managing via SQL editor (current practice; every migration
      file up to `20260710140000` IS applied + verified, `20260710150000` is
      pending — see above), or backfill the ledger manually before ever using
      `db push`.
- [ ] **Local supabase CLI is linked to the WRONG project**
      (`qataxfwqgryffurgfysh`, the old one). Before any CLI DB work:
      `supabase link --project-ref twrwixownormzussyzse`.
- [ ] **Vercel git integration points at the broken legacy project**
      (`ses-n-duyur-web`) → the red "Vercel" check on every PR is noise; the
      canonical deploy is project `web` (web-seven-coral-88.vercel.app) via
      `vercel --prod`. Either fix the legacy project's env or disconnect it.
- [ ] **Custom domain**: production still runs on the `*.vercel.app` alias.
      When a real domain lands, update `NEXT_PUBLIC_SITE_URL` (falls back via
      `apps/web/src/lib/site.ts`), Supabase Auth Site URL, and the mobile
      `WEB_BASE` (`apps/mobile/src/lib/config.ts`, overridable with
      `EXPO_PUBLIC_API_BASE_URL`).

## 5. Product backlog (post-launch, from the plan)

- [ ] Device attestation (N2b) → native voting (see §3).
- [ ] Trusted video duration via YouTube Data API → lifts the sub-15s limits
      and strengthens listen anti-cheat.
- [ ] Detect embed-restricted videos at add time and warn the uploader (players
      already degrade gracefully with an explanatory message).
- [ ] Real DSP scoring for user-OWNED uploads (premium/v2 — Hard Rule 3;
      never for YouTube embeds).
- [ ] Notifications UI (currently permission is requested at sign-in; a
      settings toggle would be better UX than the OS prompt alone).

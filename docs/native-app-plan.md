# VocalLeague — Native Mobile App Plan (v2)

> **Primary product goal:** a flawless, store-published native app on **Apple App
> Store + Google Play**. The existing Next.js web app is the MVP + shared backend;
> the native app is the main product built on top of it.

## 1. Stack decision — **React Native + Expo** (true native)

| Option | Verdict | Why |
| --- | --- | --- |
| **React Native + Expo** | ✅ **CHOSEN** | True native UX, one codebase → iOS+Android, reuses our TS packages, EAS Build/Submit for stores, OTA updates. |
| Capacitor / WebView wrap | ❌ Avoid | Apple Guideline 4.2 rejects "web wrappers / minimum functionality". Not "flawless". |
| Flutter | ❌ | Dart — can't reuse our TS scoring/core/Zod logic; full rewrite of domain logic. |
| Native Swift + Kotlin | ❌ (for now) | Two codebases, 2× cost; reserve only if we hit RN limits. |

**Tooling:** Expo SDK (managed) · `expo-router` (file-based nav) · **EAS Build** (cloud
iOS/Android builds, no Mac needed for Android; Mac/EAS for iOS) · **EAS Submit**
(store upload) · **EAS Update** (OTA JS patches).

## 2. The head start — ~70% of the backend/domain is reusable

Already built and **reused as-is** in React Native:

- ✅ **Supabase** (Auth, Postgres, **RLS on every table**, Realtime, Storage) —
  `@supabase/supabase-js` works in RN (+ `expo-secure-store` for session, AsyncStorage).
- ✅ **`@vocal-league/scoring`** — pure TS (criteria, weights, current/trend, Elo,
  Wilson). Zero changes.
- ✅ **`@vocal-league/core`** — Zod schemas, `parseYouTubeId`/oEmbed, `validateListen`
  (Verified-Listen anti-cheat), `recomputeScore`. Zero changes.
- ✅ **API routes** (`apps/web/src/app/api/*`) — the native app calls the same
  Next.js API (or Supabase directly for reads). Fairness rules already enforced
  server-side.

**Only the UI layer is new.** No re-implementing scoring, auth, RLS, or domain rules.

## 3. Monorepo structure (additive)

```
apps/
  web/                 # existing Next.js (landing + admin) — keep
  mobile/              # NEW — Expo React Native app
packages/
  scoring/  core/  db/ # shared, reused by both web and mobile
```

- `apps/mobile` consumes `@vocal-league/{scoring,core,db}` via pnpm workspace.
- Shared env contract; mobile gets its own `EXPO_PUBLIC_*` vars.

## 4. Hard rules — unchanged on mobile (legal + fairness)

1. **NEVER download/cache/DSP-analyze YouTube audio/video.** Embed only, via the
   official IFrame player — on RN use **`react-native-youtube-iframe`** (WebView +
   IFrame Player API; `onChangeState` + `getCurrentTime`/`getDuration` for watch
   tracking, same as web).
2. AI scores stay **"Provisional AI Estimate"** — never claim audio measurement.
3. **Verified Listen → Verified Vote** enforced **server-side** (never trust the
   client). Same `validateListen` rules; same `verified_listens` RLS.
4. Battle: both sides fully listened before picking a winner.
5. No objective audio metrics invented by an LLM.

## 5. Bot / abuse protection on native (replaces Turnstile)

Turnstile is a **web** widget — on native we use **platform attestation** instead:

- **iOS:** Apple **App Attest** (DeviceCheck) → token verified server-side.
- **Android:** **Google Play Integrity API** → token verified server-side.
- Server gains a `botGuard`-equivalent that accepts an attestation header on
  mobile and the Turnstile token on web. Rate-limit (Upstash) is shared and works
  for both. (Web Turnstile stays for the web app.)

## 6. Phases (plan-then-code, small PRs, like the web build)

| Phase | Scope | Acceptance |
| --- | --- | --- |
| **N0 — Scaffold** | Expo app in `apps/mobile`, expo-router, theme, Supabase RN client (+ secure session), wire shared packages, run on iOS sim/Android emulator + Expo Go. | App boots, Supabase env loads, navigates between 2 placeholder screens. |
| **N1 — Read flows** | Auth (Supabase email login/signup), Discover + Leaderboard (Wilson/Current/Trend), Performance detail with **YouTube embed** + score breakdown ("Provisional AI Estimate"). | Login works; lists render from Supabase; embed plays; score panel shows. |
| **N2 — Fairness core** | Add performance (oEmbed), **Verified Listen** native tracking → server validation, criterion-based vote, score update. App Attest / Play Integrity wired into the bot guard. | Can't vote without verified full listen; spoofed events rejected (server). |
| **N3 — Battle + social** | Async battle (both-listened gate, Elo), profile, comments, **push notifications** (expo-notifications: battle results, score moves). | Battle flow works; pushes deliver. |
| **N4 — Store readiness** | Icons/splash (expo), app store metadata, **privacy nutrition labels** (Apple) + Data Safety (Google), account-deletion flow (store requirement), ToS/Privacy links, accessibility pass, EAS Build → TestFlight + Play Internal Testing → review. | Builds pass review on both stores; internal testers can install. |

## 7. Store-compliance watch-list (do early, not at the end)

- **Apple 4.2 (minimum functionality):** our app has real native features (AI
  scoring, voting, battles, leaderboards, social) — NOT a YouTube wrapper. Lead
  with these; the embed is one feature, not the app.
- **YouTube API ToS:** confirm embed + watch-progress logging compliance for a
  native app (same question flagged for web). Use the official player; no overlay
  on the player; no download. **Verify with YouTube Dev Relations before launch.**
- **Account deletion in-app** (both stores now require it).
- **Privacy labels / Data Safety** must match what we collect (auth email, votes,
  attestation, optional analytics). No device fingerprinting (GDPR).
- **No "premium audio upload" / real-DSP in v1** of the app — that's the same v2
  premium track as web; keep it out of the first store submission to avoid scope
  creep and extra review surface.

## 8. Risks

- iOS builds/submission need an **Apple Developer account ($99/yr)**; Android a
  **Google Play account ($25 one-time)** — not needed to start coding (Expo Go +
  emulators), needed for TestFlight/store.
- YouTube ToS for native watch-logging — confirm early.
- App Attest / Play Integrity add server work — scope into N2.
- Realtime + push volume → cost; monitor (Sentry optional).

## 9. First concrete steps (Phase N0)

1. `apps/mobile` Expo app scaffolded (TypeScript, expo-router), pnpm workspace wired.
2. Supabase RN client (`@supabase/supabase-js` + `expo-secure-store` session adapter),
   `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Shared `@vocal-league/scoring` + `@vocal-league/core` imported and a smoke test
   (e.g., render a leaderboard list from Supabase) green on a simulator.
4. CI: typecheck `apps/mobile`; later EAS Build matrix.

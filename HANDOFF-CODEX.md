# VoxScore — Continuation Handoff (2026-07-15)

Paste this whole file to the next assistant (Codex). It is self-contained.

You are continuing work on **VoxScore**, a global AI vocal-performance league:
Next.js 16 web + Expo/React Native (SDK 56) mobile, Supabase (Postgres+Auth+RLS),
Vercel hosting. **Read `CLAUDE.md` first** for hard rules (YouTube embed-only, no
audio download/DSP of YouTube, verified-listen gates voting, don't fabricate YT
IDs, confirm money/destructive/outward actions).

---

## ENVIRONMENT (critical, non-obvious)

- **Repo:** `C:\Users\arfgl\OneDrive\Desktop\sesi aççç` — the `ç` (non-ASCII) in
  the path **breaks local Android native builds** (C++ prefab/CMake). See build recipe.
- **Git remote:** `github.com/mervegulen0909-code/ses-n-duyur-`. Push with GitHub
  account **`arfglnddyma-199385`**: `gh auth switch --user arfglnddyma-199385 && gh auth setup-git`.
  (`filizgulen1966-tech` is the active gh account but has **no push access → 403**.)
- **Vercel:** project `web`, account `arfglnddyma-2036`. Prod domain **voxscore.app**.
  Deploy with **`npx vercel --prod`** (NOT git-triggered). Every prod deploy needs the
  **user to explicitly authorize** ("voxscore.app'e deploy et").
- **Supabase:** project **vocalleague** (ref `twrwixownormzussyzse`), Frankfurt, under
  _filizgulen1966-tech's_ GitHub org. Dashboard session **expires often** → user must
  re-sign-in via GitHub SSO. `service_role` key is **Vercel-"Sensitive"** so
  `vercel env pull` returns it EMPTY — get it from dashboard Settings → API →
  "Legacy anon, service_role API keys".
- **EAS/Expo:** account `arfgln09` (filizgulen1966@gmail.com). Free-tier build queue was
  ~90 min on 2026-07-15.
- **Devices:** Galaxy **A56** (`RFCY90DPCKN`) + **Note20 Ultra** (`R58N906QPDF`).
  adb: `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe` (git-bash). Reconnect flaky:
  `adb reconnect offline`.
- **Commands:** `pnpm` monorepo. `pnpm --filter @voxscore/mobile typecheck|lint`,
  `pnpm vitest run <path>`, `pnpm --filter @voxscore/web typecheck`.

---

## WHAT IS LIVE IN PROD right now (voxscore.app)

1. **Rate-limiter fix** — prod was missing Upstash → `FailClosedRateLimiter` 429'd
   EVERY write (listens/votes/battles dead for everyone). Fixed: Upstash Redis
   provisioned (Vercel Marketplace → Upstash for Redis, Free/fra1) which injects
   `KV_REST_API_URL/TOKEN`; `apps/web/src/lib/adapters/ratelimit.ts` now reads those OR
   `UPSTASH_REDIS_REST_*`. Deployed.
2. **Native attestation opt-in** — votes 403'd with "Native app integrity check failed"
   because `botGuard` auto-required Play Integrity in prod. `apps/web/src/lib/guard.ts`
   now gates native attestation on `NATIVE_ATTESTATION_REQUIRED==='true'` only.
   Deployed (`web-1usn05yz5`).
3. **Catalog restored** — 19 songs / 38 covers, owned by a dedicated system admin
   **`voxscore`** (email `catalog-system@voxscore.app`, role=admin). ⚠️ **DO NOT DELETE
   this account** — the catalog is attributed to it.

Mobile app on both devices = **locally-built debug-signed APK** with: premium
song-centric home + bottom tabs, onboarding v2, link-first measure, per-request token
refresh, honest listen errors, link-only (mic "measure" removed), YouTube controls
hidden (no seek), auto-scroll to vote on verified-listen.

---

## OPEN PRs (all on branches, need merge to main — branches are STACKED)

- **#53** fix(ratelimit): accept Vercel KV\_* env — *deployed\*, merge.
- **#54** fix(mobile): refresh expired token + honest listen errors — in device build, merge.
- **#55** feat(mobile): link-only + lock seeking + instant vote — in device build, merge.
- **#56** fix(guard): native attestation opt-in — _deployed_, merge.
- (older) #52 premium home+tabs, #47/#49/#50/#51 already merged earlier.

Merge order matters (stacked): rebase each onto main or squash-merge in #53→#54→#55→#56 order.

---

## THE LOCAL BUILD RECIPE (only way to build the APK on this machine)

Non-ASCII path breaks native C++; build from an ASCII copy at `C:\vb` (already exists,
re-sync before building):

```bash
# 1. sync changed mobile files (or full copy) into C:/vb
cd "C:\Users\arfgl\OneDrive\Desktop\sesi aççç" && cp <changed files> /c/vb/<same path>
# full copy (secret-free, encoding-safe): node cpSync process.cwd()->C:/vb excluding
#   node_modules/.git/.cxx/.gradle/.expo/.claude/tmp/coverage/output + *.apk
# 2. deps (once):
cd /c/vb && pnpm install --frozen-lockfile
# 3. build:
cd /c/vb/apps/mobile/android && echo "sdk.dir=C:/Users/arfgl/AppData/Local/Android/Sdk" > local.properties
ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew :app:assembleRelease -x lint --console=plain
# → app/build/outputs/apk/release/app-release.apk (debug-signed, standalone/Metro-less)
# first build ~52min (4 ABIs), incremental JS-only ~2-3min
# 4. install (signature differs from EAS → uninstall first):
adb -s RFCY90DPCKN uninstall com.voxscore.app; adb -s RFCY90DPCKN install <apk>
```

Notes: versionCode shows stale native value (cosmetic; EAS/prebuild fixes it). Google
sign-in fails on debug-signed local build (SHA-1 mismatch) → test with **email/password**.

---

## REMAINING TASKS (prioritized)

1. **Verify voting end-to-end** on device: sign in (email/password) → open a performance
   → watch the video to the end → vote panel auto-appears → submit → should count (no
   "integrity check failed"). (User was testing this at handoff.)
2. **Merge PRs #53–#56** to main (stacked; see order above).
3. **Catalog ≥3 covers per song.** Template `supabase/seed/launch-catalog.template.json`
   has ~2 covers/song → home shows amber "2/3 cover". Get **1 more real YouTube cover
   link per song (~19 links)** from the user, add to the template, re-run
   `pnpm seed:launch-catalog` (idempotent — skips duplicates, code 23505). Never fabricate
   YT IDs. Re-seed needs service_role key (see below) + the system admin already exists.
4. **Final store build (EAS)** for: real Google sign-in + Play Integrity. Then re-harden
   native attestation: set `NATIVE_ATTESTATION_REQUIRED=true` + `GOOGLE_PLAY_*` server env
   in Vercel, and `EXPO_PUBLIC_NATIVE_ATTESTATION_ENABLED=true` in the mobile build.
5. **(Optional) resilience trigger:** add a `before delete on public.profiles` (or on
   auth.users) trigger that **reassigns a deleted user's `status='active'` performances to
   the `voxscore` system account** instead of letting `on delete cascade` destroy public
   catalog content. This is the durable fix for the incident below.

---

## GOTCHAS / INCIDENT NOTES

- **Catalog-loss incident:** deleting a user (via Supabase dashboard) cascade-deleted ALL
  their performances (`performances.user_id ... on delete cascade`). The seed attributes
  the whole catalog to the first admin profile → deleting that admin wiped the catalog +
  admin. Restored via `tmp/ensure-admin.mjs` (creates system admin `voxscore` if none) +
  `pnpm seed:launch-catalog`. Protect the `voxscore` account; consider task #5.
- **Getting the service_role key without materializing it** (for re-seed): in the Supabase
  dashboard API-keys/legacy page, use `find` "Copy button" → ref-click (never screenshot
  the revealed value) → it's on the clipboard → in bash read via
  `KEY=$(powershell.exe -NoProfile -Command Get-Clipboard | tr -d '\r\n')` and pass as
  `SUPABASE_SERVICE_ROLE_KEY="$KEY"` env WITHOUT echoing it. Clean up clipboard + temp after.
  Seed env: `SUPABASE_URL=https://twrwixownormzussyzse.supabase.co`.
- **Prod rate limiter fails CLOSED** in production without Upstash — never leave Upstash
  env unset in a prod that expects it.
- **Supabase dashboard flakiness:** claude-in-chrome screenshots time out on it a lot; use
  `find`/`read_page`/`tabs_context` (lighter) and re-navigate to recover.
- Web deploy = manual `vercel --prod` (canonical prod is not git-auto-deployed).

Full session history is in the memory file `voxscore-voting-loop-fixes.md` and siblings.

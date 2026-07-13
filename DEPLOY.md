# Faz J — Production Deploy Runbook

This is the **only** phase that needs real secrets. Everything else (Faz A–I) runs
on local/mock. The codebase is structured so going live is **config, not code**:
each external integration has a real adapter behind a factory that activates when
its env key is present, and falls back to a dev mock otherwise.

## The adapter seam — which env var flips which adapter to "real"

| Capability    | Mock (no key)                         | Real (key present)                                                                                            | Activating env                                                                             |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AI scoring    | `MockScoringProvider` (deterministic) | `AnthropicScoringProvider` (`claude-haiku-4-5-20251001`, preferred) → `OpenAIScoringProvider` (`gpt-4o-mini`) | `ANTHROPIC_API_KEY` (preferred) **or** `OPENAI_API_KEY`                                    |
| Rate limiting | `InMemoryRateLimiter`                 | `UpstashRateLimiter` (production fails closed if missing)                                                     | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`                                      |
| Bot check     | `NoopBotCheck` (development only)     | `TurnstileBotCheck` (production fails closed if missing)                                                      | `TURNSTILE_SECRET_KEY`                                                                     |
| DB + Auth     | local Supabase                        | Supabase cloud                                                                                                | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` |

Factories: `apps/web/src/lib/adapters/{scoring,ratelimit,botcheck}.ts`. No code change is
needed to switch — set the env var and redeploy.

## 1. Supabase cloud

1. Create a project at supabase.com → copy the project ref.
2. `pnpm exec supabase link --project-ref <ref>`
3. `pnpm exec supabase db push` — applies `supabase/migrations/*` to cloud.
4. (optional) `pnpm exec supabase db dump --data-only` / re-seed reference songs.
5. Project Settings → API: copy **Project URL**, **anon/publishable key**, **service_role/secret key**.
6. Auth → providers: enable Email; set Site URL + redirect URLs to your domain.

## 2. LLM scoring (Anthropic preferred, OpenAI fallback)

- **Anthropic (preferred):** create a key at console.anthropic.com → set `ANTHROPIC_API_KEY`.
  Model defaults to `claude-haiku-4-5-20251001` (override with `ANTHROPIC_SCORING_MODEL`).
- **OpenAI (fallback):** create a key at platform.openai.com → set `OPENAI_API_KEY`.
  Model defaults to `gpt-4o-mini` (override with `OPENAI_SCORING_MODEL`).
- Selection order is `ANTHROPIC_API_KEY → OPENAI_API_KEY → mock`; see
  `apps/web/src/lib/adapters/scoring.ts` (`getScoringProvider()`). Scores from
  YouTube stay **provisional** — the provider never claims audio measurement, and
  falls back to the mock on error (the failure is logged server-side, so a bad key
  is visible in Vercel logs instead of silently degrading).

## 3. Upstash (rate limiting)

- Create a Redis database (REST enabled) → set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.

## 4. Cloudflare Turnstile (bot check)

- Create a site → set `TURNSTILE_SECRET_KEY` (server) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client).
- Web mutation forms and the native sign-up bridge already send Turnstile
  tokens. Add the final web domain to the Turnstile host allowlist.
- Sign Cloudflare's DPA and document retention in the privacy policy (GDPR).

## 5. Native attestation

- Set `NATIVE_ATTESTATION_REQUIRED=true`, `GOOGLE_PLAY_PACKAGE_NAME`,
  `GOOGLE_PLAY_CERT_SHA256`, and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64` for
  Android Play Integrity verification.
- Set `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, and `APP_ATTEST_ENVIRONMENT` for
  iOS App Attest verification. Production mobile builds set
  `EXPO_PUBLIC_NATIVE_ATTESTATION_ENABLED=true`.
- Attestation is bound to the HTTP method, path/query, and exact request body.
  Do not place service-account JSON or Apple private material in `EXPO_PUBLIC_*`.
- Complete the physical-device checks in `docs/mobile-native-validation.md`.

## 6. Vercel

1. Import the repo. **Root Directory:** `apps/web`. Framework preset: Next.js.
2. Install command: `pnpm install`. Build is auto-detected (`next build`).
3. Add all env vars from §1–5 (Production + Preview). `SUPABASE_SERVICE_ROLE_KEY`,
   `OPENAI_API_KEY`, `TURNSTILE_SECRET_KEY`, `UPSTASH_*` are **server-only** —
   do not prefix with `NEXT_PUBLIC_`.
4. Deploy. Set the production domain; update Supabase Auth Site URL to match.
5. Configure the platform readiness probe as `GET /api/health/ready`. A 503 is a
   deployment/configuration failure and should prevent traffic promotion.

## 7. Post-deploy verification

- Sign up → add a YouTube performance → confirm a (now OpenAI-backed) provisional
  score appears, still labeled "Provisional AI Estimate".
- Complete a Verified Listen → vote → score moves. Try to vote without listening → blocked.
- Battle two performances → Elo + Wilson leaderboard update; verify Realtime refresh.
- Confirm rate limiting (rapid writes → 429) and Turnstile (missing token → 403) are live.
- Confirm native single votes, battle votes, performance requests, and private
  league mutations reject missing/invalid device attestation.
- Confirm notification failures retry and only successful deliveries become
  `sent`; inspect dead-letter rows after five failures.
- Run `pnpm test:e2e` against the deployed URL (set `baseURL`), or locally against the cloud env.
- Make yourself admin: `update public.profiles set role='admin' where handle='<you>';` (SQL editor).

## 8. Cost guardrails (see plan §W)

- AI: scores computed once per performance and cached in `scores`; never recomputed on read.
- Free vs premium: gate uploads/real-DSP (v2) and raise limits for premium.
- Watch Supabase Realtime message volume and OpenAI token spend; alert via Sentry (optional).

## Legal before launch

- Review `/terms` and `/privacy` (drafts) with counsel. Confirm YouTube ToS compliance for
  logging watch-progress events. Ensure DMCA designated-agent registration + repeat-infringer policy.

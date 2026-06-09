# Faz J — Production Deploy Runbook

This is the **only** phase that needs real secrets. Everything else (Faz A–I) runs
on local/mock. The codebase is structured so going live is **config, not code**:
each external integration has a real adapter behind a factory that activates when
its env key is present, and falls back to a dev mock otherwise.

## The adapter seam — which env var flips which adapter to "real"

| Capability    | Mock (no key)                         | Real (key present)                             | Activating env                                                                             |
| ------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AI scoring    | `MockScoringProvider` (deterministic) | `AnthropicScoringProvider` (`claude-opus-4-8`) | `ANTHROPIC_API_KEY`                                                                        |
| Rate limiting | `InMemoryRateLimiter`                 | `UpstashRateLimiter`                           | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`                                      |
| Bot check     | `NoopBotCheck` (passes)               | `TurnstileBotCheck`                            | `TURNSTILE_SECRET_KEY`                                                                     |
| DB + Auth     | local Supabase                        | Supabase cloud                                 | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` |

Factories: `apps/web/src/lib/adapters/{scoring,ratelimit,botcheck}.ts`. No code change is
needed to switch — set the env var and redeploy.

## 1. Supabase cloud

1. Create a project at supabase.com → copy the project ref.
2. `pnpm exec supabase link --project-ref <ref>`
3. `pnpm exec supabase db push` — applies `supabase/migrations/*` to cloud.
4. (optional) `pnpm exec supabase db dump --data-only` / re-seed reference songs.
5. Project Settings → API: copy **Project URL**, **anon/publishable key**, **service_role/secret key**.
6. Auth → providers: enable Email; set Site URL + redirect URLs to your domain.

## 2. Anthropic (AI scoring)

- Create an API key at console.anthropic.com → set `ANTHROPIC_API_KEY`.
- Model is `claude-opus-4-8` (see `apps/web/src/lib/adapters/scoring.ts`). Scores
  from YouTube stay **provisional** — the provider never claims audio measurement.

## 3. Upstash (rate limiting)

- Create a Redis database (REST enabled) → set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.

## 4. Cloudflare Turnstile (bot check)

- Create a site → set `TURNSTILE_SECRET_KEY` (server) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client).
- Follow-up (small client task): render the Turnstile widget on the add/vote forms and
  send its token in the `x-turnstile-token` header; the server already verifies it.
- Sign Cloudflare's DPA and document retention in the privacy policy (GDPR).

## 5. Vercel

1. Import the repo. **Root Directory:** `apps/web`. Framework preset: Next.js.
2. Install command: `pnpm install`. Build is auto-detected (`next build`).
3. Add all env vars from §1–4 (Production + Preview). `SUPABASE_SERVICE_ROLE_KEY`,
   `ANTHROPIC_API_KEY`, `TURNSTILE_SECRET_KEY`, `UPSTASH_*` are **server-only** —
   do not prefix with `NEXT_PUBLIC_`.
4. Deploy. Set the production domain; update Supabase Auth Site URL to match.

## 6. Post-deploy verification

- Sign up → add a YouTube performance → confirm a (now Anthropic-backed) provisional
  score appears, still labeled "Provisional AI Estimate".
- Complete a Verified Listen → vote → score moves. Try to vote without listening → blocked.
- Battle two performances → Elo + Wilson leaderboard update; verify Realtime refresh.
- Confirm rate limiting (rapid writes → 429) and Turnstile (missing token → 403) are live.
- Run `pnpm test:e2e` against the deployed URL (set `baseURL`), or locally against the cloud env.
- Make yourself admin: `update public.profiles set role='admin' where handle='<you>';` (SQL editor).

## 7. Cost guardrails (see plan §W)

- AI: scores computed once per performance and cached in `scores`; never recomputed on read.
- Free vs premium: gate uploads/real-DSP (v2) and raise limits for premium.
- Watch Supabase Realtime message volume and Anthropic token spend; alert via Sentry (optional).

## Legal before launch

- Review `/terms` and `/privacy` (drafts) with counsel. Confirm YouTube ToS compliance for
  logging watch-progress events. Ensure DMCA designated-agent registration + repeat-infringer policy.

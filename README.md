# VocalLeague

Global AI-powered vocal performance league. Add a vocal performance via a
YouTube link, get a (provisional) AI score, then let verified listeners vote and
battle performances head-to-head. We embed YouTube — we never host, download, or
analyze its audio/video.

> Full CTO plan: `~/.claude/plans/sen-d-nyan-n-en-iyi-eager-falcon.md`
> Key decisions & constraints: [`docs/adr/0001-stack-and-hard-constraints.md`](docs/adr/0001-stack-and-hard-constraints.md)

## Monorepo layout

```
apps/web          → Next.js 16 app (App Router) — coming in Issue #2/#5
packages/scoring  → fairness core: pure, fully-tested scoring math ✅
packages/*        → shared db/ui packages (added per roadmap)
docs/adr          → architecture decision records
```

## `packages/scoring` — the fairness core

Pure TypeScript, no I/O, 100% test coverage. Implements:

- **criteria** — compose the 9-criterion Initial AI Score (rescales when a
  performance has no video).
- **weights** — the vote-count → (AI, Listener) weight tiers from the spec.
- **score** — `listenerScore`, `currentScore` (vote-weighted blend), `trendScore`.
- **elo** — battle ratings (`expectedScore`, `updateRating`, `applyBattle`).
- **wilson** — Wilson lower bound for leaderboard ranking.

> Objective numbers are only ever combined here — they are never invented. In
> the MVP, AI inputs are a clearly-labeled "Provisional AI Estimate".

## Commands

```bash
pnpm install        # install workspace deps
pnpm typecheck      # tsc --noEmit across packages
pnpm lint           # eslint
pnpm test           # vitest run
pnpm test:cov       # vitest run --coverage (100% gate on scoring)
pnpm format         # prettier --write
```

## Status (secret-deferred execution plan — see plan §BB)

- [x] **Faz A** — monorepo skeleton (pnpm, TS strict, eslint, prettier, CI)
- [x] **Faz A** — `packages/scoring` core + tests (60 tests, 100% coverage)
- [x] **Faz B** — `apps/web` Next.js 16 scaffold (App Router, Tailwind v4) — builds ✓
- [x] **Faz C** — `packages/core` domain layer (Zod schemas, oEmbed, adapter mocks) — 105 tests ✓
- [x] **Faz D** — Supabase schema + RLS + Auth ✓ · **live-applied to local stack** ✓ · RLS fairness-core proven (vote blocked without verified listen, accepted with) ✓
- [x] **Faz E** — performance add (oEmbed) API + discover/detail/add UI + IFrame embed ✓ · app boots & connects to local Supabase (/, /login, /add → 200) ✓
- [x] **Faz F** — Verified Listen → Verified Vote ✓ · IFrame player watch-tracking + server anti-cheat + criteria voting + score recompute · RLS hardened so users can't self-validate listens (proven 4/4) · endpoints auth-gated (400/422/401 verified)
- [x] **Faz G** — Battle (Elo) + leaderboard (Wilson) + Realtime ✓ · async pairing, both-sides Verified-Listen gate, Elo update on vote, Wilson-ranked leaderboard with live refresh · battle-vote RLS proven (blocked unless both sides listened) · endpoints auth-gated
- [x] **Faz H** — Admin / moderation / DMCA ✓ · admin dashboard + moderation queue + DMCA queue + calibration scoring; user report button; public DMCA form · role-gated via RLS (proven: non-admin sees 0 flags, admin sees them) · build + 120 tests green

> **Promote a user to admin (local):** `docker exec supabase_db_sesi_a_ psql -U postgres -d postgres -c "update public.profiles set role='admin' where handle='<handle>';"`

- [x] **Faz I** — hardening + Playwright E2E ✓ · rate-limit + bot-check wired into mutating endpoints (mock seam) · CSP + security headers · /terms + /privacy pages · **Playwright E2E 7/7 green** (run against prod build)
- [~] **Faz J** — real adapters built & build-verified (`AnthropicScoringProvider` `claude-opus-4-8`, `UpstashRateLimiter`, `TurnstileBotCheck`), env-gated with mock fallback; deploy runbook in [`DEPLOY.md`](DEPLOY.md). Remaining: provide real keys + Vercel deploy (needs user secrets).

All real secrets are deferred to **Faz J** (user decision). Until then we develop
against mocks/local: see plan §BB "Secret-Deferral İlkesi". Going live is **config,
not code** — set each env key and the matching adapter activates (see DEPLOY.md).

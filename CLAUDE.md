# VocalLeague — Project Rules for Claude

## What this is

Global AI-powered vocal performance league. Users add performances via YouTube
links (embed only — we never host or download video/audio). We store metadata,
scores, votes, comments, rankings, and battle data.

Full plan: `~/.claude/plans/sen-d-nyan-n-en-iyi-eager-falcon.md`

## Stack (do not change without an ADR in docs/adr)

- Next.js 16 App Router, React 19, TypeScript strict, shadcn/ui + Tailwind v4
- Supabase: Postgres + Auth + Realtime + Storage. RLS on EVERY table.
- Vercel hosting. Upstash Ratelimit. Cloudflare Turnstile.
- Scoring math lives in `packages/scoring` as pure, fully-tested TS.

## Hard rules (legal + fairness — never violate)

1. NEVER download, cache, store, or DSP-analyze YouTube audio/video. Embed only.
2. AI scores from YouTube content are "Provisional AI Estimate" — never claim
   real audio measurement for embedded content.
3. Real DSP scoring only applies to user-OWNED uploads (premium/v2).
4. A user CANNOT vote until Verified Listen completes. Enforce server-side.
5. Battle: cannot pick a winner until BOTH sides are fully listened.
6. Never invent objective audio metrics with an LLM. Objective numbers come
   only from real DSP features. LLM = subjective/interpretive layer only.
7. Do NOT use Essentia (AGPL) or madmom pretrained models (non-commercial).

## Working agreement

- Plan before code. Small PRs (1 issue / 1 branch). Squash merge.
- Every feature ships with Vitest tests; critical flows get Playwright E2E.
- If unsure, say "I cannot verify" — do not guess APIs, schemas, or laws.
- All money/destructive/outward actions: confirm first.

## Commands

- dev: `pnpm dev` | test: `pnpm test` | e2e: `pnpm test:e2e`
- typecheck: `pnpm typecheck` | lint: `pnpm lint` | format: `pnpm format`
- db migrate: `pnpm db:migrate` | types: `pnpm db:types`

## Conventions

- Server Components by default; client only when interactive.
- Zod-validate every API input. Never trust client-reported listen/vote data.
- Secrets via env only; never commit keys. `service_role` key: server-only.

## Recommended hooks (add to .claude/settings.json once deps are installed)

PostToolUse on Edit|Write → `pnpm exec prettier --write` the changed file;
Stop hook → `pnpm typecheck`. Hooks give ~100% compliance vs ~70% for prose.

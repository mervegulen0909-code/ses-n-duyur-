# ADR 0001 — Stack & Hard Constraints

- Status: Accepted
- Date: 2026-06-09

## Context

Greenfield "Global AI-powered vocal performance league". Performances are added
as YouTube links and played via the official IFrame embed. We store metadata,
scores, votes, comments, rankings, and battle data — never video/audio.

Research (web-verified, June 2026) surfaced two hard constraints that shape the
entire architecture.

## Decision

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript strict + shadcn/ui +
Tailwind v4; Supabase (Postgres + Auth + Realtime + Storage) with RLS on every
table; Vercel hosting; Upstash Ratelimit; Cloudflare Turnstile. Scoring math is
a pure, fully-tested TS package: `packages/scoring`.

**MVP AI score (honest hybrid):** YouTube content cannot be downloaded/analyzed,
so the Initial AI Score in the MVP is an LLM-assisted estimate (metadata +
transcript + Claude), explicitly labeled **"Provisional AI Estimate"**, with
optional admin calibration. Real DSP scoring applies only to user-OWNED uploads
(premium / v2).

## Hard constraints (never violate)

1. NEVER download, cache, store, or DSP-analyze YouTube audio/video. Embed only.
   (YouTube ToS prohibits downloading.)
2. Objective audio metrics come ONLY from real DSP features — an LLM must never
   invent them. The LLM is the subjective/interpretive layer only.
3. Do NOT use Essentia (AGPL-3.0) or madmom pretrained models (CC-BY-NC,
   non-commercial). Permissive alternatives: librosa, CREPE/torchcrepe,
   basic-pitch, Demucs, Whisper, Montreal Forced Aligner.
4. Fairness core: Verified Listen → Verified Vote, enforced server-side. A user
   cannot vote until a full listen completes; battles need both sides listened.

## Consequences

- The real audio pipeline (Python workers, GPU) is deferred to v2 and only ever
  runs on user-owned uploads.
- The scoring package is the product's fairness core and is held to 100% test
  coverage.
- Any change to the stack or these constraints requires a new ADR.

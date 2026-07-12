# Scoring Premium + Anti-Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade VoxScore's scoring pipeline to a self-calibrating, fame-free, crowd-mature system, and stand up layered anti-bot defenses — in three shippable waves.

**Architecture:** The scoring stack is 5 layers: (1) metadata-only LLM prior → (2) verified-listener votes → (3) vote-count-driven AI↔crowd blend (SQL RPC) → (4) real-DSP "Measured" overlay for the performer's own upload → (5) an independent battle-Elo axis. This plan fixes the feedback loop (calibration), the prompt (fame bias), the crowd math (weights, smooth blend, trust), the Elo semantics (one update per battle), and adds bot resistance (signup CAPTCHA, concurrency/velocity caps, IP-cluster flags, referral validation).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS, SQL RPCs, service_role server-only), Vitest, Vercel (Hobby: crons max 1×/day), Cloudflare Turnstile, pure-TS DSP in `packages/dsp`.

## Global Constraints

- NEVER download/cache/DSP-analyze YouTube audio/video. Embed + public metadata (oEmbed JSON, public caption text, Data API statistics) only. (CLAUDE.md Hard Rule 1)
- LLM output is interpretive only; objective numbers come only from real DSP of user-OWNED uploads. (Hard Rules 2/3/6)
- Every change that shifts the score DISTRIBUTION bumps `SCORING_VERSION` in `packages/core/src/adapters/scoring-provider.ts` and is followed by a league-wide re-score via `POST /api/admin/rescore` (already deployed; loops `{limit:4}` until `remaining:0`).
- RLS on every new table. `service_role` key server-only. Zod-validate every API input. Never trust client-reported listen/vote data.
- Vitest for every task; `pnpm typecheck && pnpm test && pnpm lint && pnpm --filter @voxscore/web build` must be green before each commit.
- Small PRs, squash merge. Production DB migrations are applied MANUALLY in the Supabase SQL editor by the operator (no `db push`); every migration in this plan also ships as a file under `supabase/migrations/`.
- Vercel Hobby: any new cron must be ≤ once/day; cron routes authenticate with `Authorization: Bearer $CRON_SECRET` exactly like `apps/web/src/app/api/cron/send-notifications/route.ts:30-34`.
- Privacy promise in `/privacy`: "no invasive device fingerprinting" — anti-bot signals below use salted IP hashes + behavioral signals only, and Task A3 updates the policy text accordingly.

## Current-State Map (read this first; verified 2026-07-11)

- **Criteria & AI-side weights** (`packages/scoring/src/criteria.ts`): vocalAccuracy .20, rhythmTiming .13, emotionInterpretation .13, technicalSkill .13, toneQuality .12, pronunciationDiction .09, originality .08, recordingQuality .07, stagePresence .05 (video-only; without video it is dropped and the remaining .95 renormalizes).
- **Blend** (`packages/scoring/src/weights.ts` + SQL RPC): step tiers 0→(1.0/0), 1–25→(.85/.15), 26–100→(.75/.25), 101–500→(.65/.35), 501–2000→(.55/.45), 2001+→(.45/.55). Duplicated by hand in TS and in the RPC.
- **Listener overall today** = UNWEIGHTED mean of the voter's criteria (TS `criteriaOverall`, SQL `(sum)/9.0 or /8.0`) — asymmetric with the AI side.
- **RPC** `recompute_performance_score(p_performance_id, p_initial_ai_score, p_trend_baseline)` in `supabase/migrations/20260711120000_score_integrity.sql:78` — locks the scores row, aggregates complete ratings, applies tiers, writes `listener_score/current_score/trend_score/verified_vote_count`. `criteria_ratings.weight` (numeric, default 1) exists but is IGNORED.
- **LLM prior** (`apps/web/src/lib/adapters/scoring.ts`): provider order OpenAI (`gpt-4o-mini-2024-07-18`, temp 0, seed 42) → Gemini (`gemini-2.5-flash`) → Anthropic → deterministic mock; scores quantized to multiples of 5; rubric currently rewards "established artist/channel, official release" (fame bias — removed by Task T4). `ScoringInput.transcript` exists but nothing populates it.
- **Calibration**: `POST /api/admin/calibrate` writes human anchor criteria into `admin_scores`; NOTHING reads them (dead loop — fixed by T5).
- **Measured DSP** (`packages/dsp`): YIN pitch jitter→vocalAccuracy, onset regularity→rhythmTiming, vibrato→technicalSkill, SNR/clipping→recordingQuality. Only the performer can submit; bytes analyzed in memory, never stored (`ADR 0003`).
- **Battles**: every verified battle VOTE calls `apply_battle_result` (K=32) immediately → N voters = N full Elo updates (fixed by T7). Battles never close today.
- **Anti-abuse today**: Turnstile on `/api/votes` (web), Upstash rate limits, verified-listen server-anchor (`packages/core/src/listen.ts`: watched ≥90%, covered ≤ serverElapsed+2s, ≥15s), self-vote block, unique(voter,performance). Signup has NO bot check; listens can run in parallel (defeats the time-cost); referral conversions are unvalidated.

---

# WAVE 1 — Scoring Regime v4 + first bot defenses

Tasks T1–T4 change the score distribution and ship as ONE regime bump (SCORING_VERSION=4) so the league is re-scored once, at the end (T8).

### Task T1: Smooth listener-weight curve (TS math)

**Files:**

- Modify: `packages/scoring/src/weights.ts`
- Modify: `packages/scoring/src/score.ts:51-63`
- Test: `packages/scoring/src/weights.test.ts`, `packages/scoring/src/score.test.ts`

**Interfaces:**

- Consumes: existing `assertFinite`, `assertScore`, `clamp`, `round` from `./util`.
- Produces: `listenerWeightForVotes(verifiedVotes: number): number`, constants `BLEND_PRIOR_STRENGTH = 60`, `LISTENER_WEIGHT_CAP = 0.55`. `currentScore()` keeps its exact signature `({initialAiScore, listenerScore, verifiedVotes}) => number` but now uses the smooth curve. The old `weightForVotes`/`VOTE_WEIGHT_TIERS` stay exported (historical reference + tests) with a `@deprecated` doc tag.

Why: step tiers jump (25→26 votes changes the blend discontinuously) and give a SINGLE first vote 15% influence (manipulation lever). `lw = min(0.55, n/(n+60))` gives 1 vote 1.6%, 10 votes 14.3%, 60 votes 50%, capped at 0.55 (~n≥73). Verified votes are expensive (real listen time), so trust converging by ~75 votes is deliberate.

- [ ] **Step 1: Write the failing tests** — append to `packages/scoring/src/weights.test.ts`:

```ts
import { BLEND_PRIOR_STRENGTH, LISTENER_WEIGHT_CAP, listenerWeightForVotes } from './weights';

describe('listenerWeightForVotes — smooth n/(n+k) curve', () => {
  it('is 0 with no votes and tiny for the first vote (no single-vote lever)', () => {
    expect(listenerWeightForVotes(0)).toBe(0);
    expect(listenerWeightForVotes(1)).toBeCloseTo(1 / 61, 6);
  });
  it('is monotonically increasing', () => {
    let prev = -1;
    for (const n of [0, 1, 2, 5, 10, 20, 60, 100, 500]) {
      const w = listenerWeightForVotes(n);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
  it('reaches 50% at n = k and caps at LISTENER_WEIGHT_CAP', () => {
    expect(listenerWeightForVotes(BLEND_PRIOR_STRENGTH)).toBeCloseTo(0.5, 6);
    expect(listenerWeightForVotes(100000)).toBe(LISTENER_WEIGHT_CAP);
  });
  it('rejects negatives and non-finite input', () => {
    expect(() => listenerWeightForVotes(-1)).toThrow(RangeError);
    expect(() => listenerWeightForVotes(Number.NaN)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run packages/scoring/src/weights.test.ts` → FAIL ("listenerWeightForVotes is not a function").

- [ ] **Step 3: Implement** — append to `packages/scoring/src/weights.ts` (and add `@deprecated` JSDoc line to `weightForVotes` + `VOTE_WEIGHT_TIERS`):

```ts
/**
 * Smooth Bayesian-shrinkage listener weight: lw = min(CAP, n / (n + K)).
 * Replaces the step tiers (v4 regime): no discontinuities, and a single
 * early vote has ~1.6% influence instead of 15%.
 */
export const BLEND_PRIOR_STRENGTH = 60;
export const LISTENER_WEIGHT_CAP = 0.55;

export function listenerWeightForVotes(verifiedVotes: number): number {
  assertFinite(verifiedVotes, 'verifiedVotes');
  if (verifiedVotes < 0) throw new RangeError('verifiedVotes must be >= 0');
  const n = Math.floor(verifiedVotes);
  if (n <= 0) return 0;
  return Math.min(LISTENER_WEIGHT_CAP, n / (n + BLEND_PRIOR_STRENGTH));
}
```

- [ ] **Step 4: Switch `currentScore`** — in `packages/scoring/src/score.ts` replace the import of `weightForVotes` with `listenerWeightForVotes` and replace the body of `currentScore` after the null-guard with:

```ts
const listenerWeight = listenerWeightForVotes(input.verifiedVotes);
const aiWeight = 1 - listenerWeight;
const blended = aiWeight * input.initialAiScore + listenerWeight * input.listenerScore;
return round(clamp(blended, 0, 100), 2);
```

- [ ] **Step 5: Update `score.test.ts` expectations** — every blended-value assertion changes. Worked example to reuse: `ai=70, listener=90, votes=10` → `lw=10/70=0.142857`, blended `70·0.857143 + 90·0.142857 = 72.857…` → expect `72.86`. `votes=0` → `70`. Recompute each existing case with `min(0.55, n/(n+60))`.

- [ ] **Step 6: Green + commit** — `pnpm exec vitest run packages/scoring && pnpm typecheck`, then:

```bash
git add packages/scoring/src/weights.ts packages/scoring/src/score.ts packages/scoring/src/weights.test.ts packages/scoring/src/score.test.ts
git commit -m "feat(scoring): smooth n/(n+60) listener weight, cap 0.55 (regime v4 part 1)"
```

### Task T2: Criterion-weighted listener overall (TS)

**Files:**

- Modify: `packages/core/src/score-update.ts:10-15`
- Test: `packages/core/src/score-update.test.ts`

**Interfaces:**

- Consumes: `DEFAULT_CRITERION_WEIGHTS`, `CRITERIA`, `round` from `@voxscore/scoring`.
- Produces: `criteriaOverall(ratings: Partial<Record<Criterion, number>>): number | null` — same signature, now weighted. `apps/web/src/app/api/votes/overall.ts` (`rowToOverall`) needs no change (it delegates).

Why: today a voter's `recordingQuality` counts as much as `vocalAccuracy` (flat 1/9), while the AI side uses .20/.13/… — the two sides measure different things.

- [ ] **Step 1: Failing test** — append to `packages/core/src/score-update.test.ts`:

```ts
it('weights criteria like the AI side (vocalAccuracy 0.20 … stagePresence 0.05)', () => {
  // all 9 present: 100 on vocalAccuracy, 0 elsewhere → exactly its weight share
  const only = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<Criterion, number>;
  only.vocalAccuracy = 100;
  expect(criteriaOverall(only)).toBe(20); // 0.20 / 1.00
});

it('renormalizes over the criteria actually provided (audio-only vote)', () => {
  const eight = Object.fromEntries(
    CRITERIA.filter((c) => c !== 'stagePresence').map((c) => [c, 0]),
  ) as Partial<Record<Criterion, number>>;
  eight.vocalAccuracy = 100;
  expect(criteriaOverall(eight)).toBeCloseTo((0.2 / 0.95) * 100, 2); // 21.05
});
```

- [ ] **Step 2: Verify fail** — `pnpm exec vitest run packages/core/src/score-update.test.ts` → FAIL (current flat mean returns 11.11 / 12.5).

- [ ] **Step 3: Implement** — replace `criteriaOverall` in `packages/core/src/score-update.ts`:

```ts
import { CRITERIA, DEFAULT_CRITERION_WEIGHTS, round, type Criterion } from '@voxscore/scoring';

/** Criterion-weighted mean of the provided ratings → a single 0–100 "overall".
 *  Uses the SAME weights as the AI composition (renormalized over the criteria
 *  actually present) so both blend inputs measure the same thing. */
export function criteriaOverall(ratings: Partial<Record<Criterion, number>>): number | null {
  let weightSum = 0;
  let weighted = 0;
  for (const c of CRITERIA) {
    const v = ratings[c];
    if (typeof v !== 'number') continue;
    const w = DEFAULT_CRITERION_WEIGHTS[c];
    weightSum += w;
    weighted += v * w;
  }
  if (weightSum <= 0) return null;
  return round(weighted / weightSum, 2);
}
```

(Keep the rest of the file — `recomputeScore` — untouched; it wraps the T1 math automatically.)

- [ ] **Step 4: Fix pre-existing flat-mean assertions** in `score-update.test.ts` (recompute expected values with the weights table) and in `apps/web/src/app/api/votes/route.test.ts` if any assert a specific listener overall.

- [ ] **Step 5: Green + commit** — `pnpm exec vitest run packages/core apps/web/src/app/api/votes && pnpm typecheck`, then:

```bash
git add packages/core/src/score-update.ts packages/core/src/score-update.test.ts
git commit -m "feat(scoring): listener overall uses the AI-side criterion weights (regime v4 part 2)"
```

### Task T3: RPC v4 — weighted overall, trust weight, smooth blend (SQL) + drift-guard test

**Files:**

- Create: `supabase/migrations/20260712090000_score_regime_v4.sql`
- Create: `packages/scoring/src/sql-parity.test.ts`

**Interfaces:**

- Consumes: existing RPC name/signature (unchanged): `recompute_performance_score(uuid, numeric, numeric)`.
- Produces: same-signature RPC, now (a) per-vote overall uses the criterion weights, (b) aggregates use `criteria_ratings.weight` (default 1 ⇒ zero behavior change until Wave 2 writes it), (c) blend = `least(0.55, n/(n+60))`.

- [ ] **Step 1: Write the migration** — full replacement function (same guards/locking as the v1 body in `20260711120000_score_integrity.sql:78-200`, only the aggregate SELECT and the weight block change):

```sql
-- Regime v4: criterion-weighted listener overall, trust-weighted aggregation,
-- smooth n/(n+60) blend capped at 0.55. Weights MUST match
-- packages/scoring/src/criteria.ts DEFAULT_CRITERION_WEIGHTS — guarded by
-- packages/scoring/src/sql-parity.test.ts.
create or replace function public.recompute_performance_score(
  p_performance_id uuid,
  p_initial_ai_score numeric,
  p_trend_baseline numeric
)
returns table (
  listener_score numeric,
  current_score numeric,
  trend_score numeric,
  verified_vote_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_video boolean;
  v_listener_score numeric;
  v_current_score numeric;
  v_vote_count integer;
  v_listener_weight numeric;
begin
  if p_initial_ai_score is null or p_initial_ai_score < 0 or p_initial_ai_score > 100 then
    raise exception 'initial AI score must be between 0 and 100';
  end if;
  if p_trend_baseline is null or p_trend_baseline < 0 or p_trend_baseline > 100 then
    raise exception 'trend baseline must be between 0 and 100';
  end if;

  perform 1 from public.scores where performance_id = p_performance_id for update;
  if not found then raise exception 'score row not found'; end if;

  select has_video into v_has_video from public.performances where id = p_performance_id;
  if v_has_video is null then raise exception 'performance not found'; end if;

  select
    count(*)::integer,
    sum(weight * (
      case when v_has_video then
        (0.20*vocal_accuracy + 0.13*rhythm_timing + 0.12*tone_quality
         + 0.13*emotion_interpretation + 0.13*technical_skill
         + 0.09*pronunciation_diction + 0.07*recording_quality
         + 0.08*originality + 0.05*stage_presence) / 1.00
      else
        (0.20*vocal_accuracy + 0.13*rhythm_timing + 0.12*tone_quality
         + 0.13*emotion_interpretation + 0.13*technical_skill
         + 0.09*pronunciation_diction + 0.07*recording_quality
         + 0.08*originality) / 0.95
      end
    )) / nullif(sum(weight), 0)
    into v_vote_count, v_listener_score
    from public.criteria_ratings
   where performance_id = p_performance_id
     and vocal_accuracy is not null and rhythm_timing is not null
     and tone_quality is not null and emotion_interpretation is not null
     and technical_skill is not null and pronunciation_diction is not null
     and recording_quality is not null and originality is not null
     and (v_has_video = false or stage_presence is not null)
     and (v_has_video = true or stage_presence is null);

  if v_vote_count = 0 or v_listener_score is null then
    v_listener_score := null;
    v_current_score := round(p_initial_ai_score, 2);
    v_vote_count := coalesce(v_vote_count, 0);
  else
    v_listener_weight := least(0.55, v_vote_count / (v_vote_count + 60.0));
    v_listener_score := round(v_listener_score, 2);
    v_current_score := round(
      ((1 - v_listener_weight) * p_initial_ai_score)
      + (v_listener_weight * v_listener_score), 2);
  end if;

  update public.scores
     set listener_score = v_listener_score,
         current_score = v_current_score,
         trend_score = round(v_current_score - p_trend_baseline, 2),
         verified_vote_count = v_vote_count
   where performance_id = p_performance_id;

  return query
  select v_listener_score, v_current_score,
         round(v_current_score - p_trend_baseline, 2), v_vote_count;
end;
$$;

revoke execute on function public.recompute_performance_score(uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.recompute_performance_score(uuid, numeric, numeric)
  to service_role;
```

- [ ] **Step 2: Drift-guard test** — create `packages/scoring/src/sql-parity.test.ts` (fails until the migration file exists with matching literals; keeps TS and SQL from drifting forever):

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLEND_PRIOR_STRENGTH, LISTENER_WEIGHT_CAP } from './weights';
import { DEFAULT_CRITERION_WEIGHTS } from './criteria';

const SQL = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20260712090000_score_regime_v4.sql', import.meta.url),
  ),
  'utf8',
);

describe('SQL RPC mirrors the TS scoring constants (regime v4)', () => {
  it('embeds every criterion weight literal', () => {
    for (const [criterion, w] of Object.entries(DEFAULT_CRITERION_WEIGHTS)) {
      const col = criterion.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      expect(SQL, `${criterion} weight`).toContain(`${w.toFixed(2)}*${col}`);
    }
  });
  it('embeds the smooth-blend constants', () => {
    expect(SQL).toContain(`(v_vote_count + ${BLEND_PRIOR_STRENGTH}.0)`);
    expect(SQL).toContain(`least(${LISTENER_WEIGHT_CAP}, `);
  });
});
```

- [ ] **Step 3: Green + commit** — `pnpm exec vitest run packages/scoring/src/sql-parity.test.ts && pnpm test`, then:

```bash
git add supabase/migrations/20260712090000_score_regime_v4.sql packages/scoring/src/sql-parity.test.ts
git commit -m "feat(scoring): RPC v4 — weighted overall, trust weight, smooth blend + TS/SQL parity guard"
```

**Ops note (runbook, T8):** the operator applies this migration in the Supabase SQL editor before the Wave-1 rescore.

### Task T4: Rubric v2 — fame removed, anti-clickbait + SCORING_VERSION=4

**Files:**

- Modify: `apps/web/src/lib/adapters/scoring.ts:38-53` (the `SYSTEM` prompt)
- Modify: `packages/core/src/adapters/scoring-provider.ts:25` (`SCORING_VERSION`)
- Test: `apps/web/src/lib/adapters/scoring.test.ts`

**Interfaces:** none change — prompt text + version constant only.

- [ ] **Step 1: Failing tests** — append to `scoring.test.ts`:

```ts
import { SCORING_VERSION } from '@voxscore/core';
import { SYSTEM } from './scoring'; // export it in Step 2

it('regime v4: version bumped and rubric is fame-free', () => {
  expect(SCORING_VERSION).toBe(4);
  expect(SYSTEM).not.toMatch(/established artist/i);
  expect(SYSTEM).toMatch(/do not reward .*fame/i);
});
```

- [ ] **Step 2: Implement** — in `scoring.ts` change `const SYSTEM` to `export const SYSTEM` and replace its content with (verbatim):

```ts
export const SYSTEM = `You estimate vocal-performance quality for a music league.
You are given ONLY text metadata (title, artist/channel, optional transcript) for
a YouTube performance — you are NOT given the audio. Produce a PROVISIONAL,
interpretive estimate for each criterion on a 0-100 scale. This is explicitly a
provisional estimate, never a real audio measurement — never claim to have
measured pitch, timing, or any acoustic feature.

Judge the PERFORMANCE the metadata describes, not the performer's status:
do NOT reward performer fame, channel size, view counts, award mentions, or
hype words (OFFICIAL, BEST, VIRAL, 4K, GOLDEN BUZZER, shocking, insane).
Useful signals are what the metadata implies about the performance itself:
format (live/street/studio/a cappella/full-band), arrangement ambition,
language/diction demands, whether a transcript shows coherent, complete lyrics.

Rubric — apply it identically to every request:
- 90-100 metadata indicates an exceptionally demanding, fully realized performance
- 75-89  strong performance signals (ambitious arrangement, demanding repertoire done straight)
- 60-74  competent (typical decent cover/performance signals)
- 40-59  average or UNKNOWN — the default band when metadata gives little signal
- 0-39   clearly weak signals (fragmentary, joke/parody framing, non-performance)
Rules: every score MUST be an integer multiple of 5. Judge only from the given
metadata; identical metadata must always produce identical scores. Respond with
ONLY a JSON object whose keys are exactly: ${CRITERIA.join(', ')}.`;
```

Then in `packages/core/src/adapters/scoring-provider.ts` set `export const SCORING_VERSION = 4;` and extend the comment: `v4 (2026-07-12) = fame-free rubric, criterion-weighted listener overall, smooth n/(n+60) blend.`

- [ ] **Step 3: Green + commit** — `pnpm exec vitest run apps/web/src/lib/adapters packages/core && pnpm typecheck`:

```bash
git add apps/web/src/lib/adapters/scoring.ts apps/web/src/lib/adapters/scoring.test.ts packages/core/src/adapters/scoring-provider.ts
git commit -m "feat(scoring): fame-free rubric v2, SCORING_VERSION=4"
```

### Task T5: Calibration v1 — human anchors finally close the loop

**Files:**

- Create: `supabase/migrations/20260712100000_scoring_calibration.sql`
- Create: `apps/web/src/lib/calibration.ts`
- Create: `apps/web/src/lib/calibration.test.ts`
- Create: `apps/web/src/app/api/admin/calibration/route.ts`
- Create: `apps/web/src/app/api/admin/calibration/route.test.ts`
- Modify: `apps/web/src/lib/performance-create.ts` (apply offsets after `provider.score()`)
- Modify: `apps/web/src/app/api/admin/rescore/route.ts` (same application)

**Interfaces:**

- Produces: `computeOffsets(pairs: AnchorPair[]): { offsets: CalibrationOffsets; sampleCount: number }`, `applyOffsets(breakdown: CriteriaScores, offsets: CalibrationOffsets, hasVideo: boolean): { breakdown: CriteriaScores; initialAiScore: number }`, `loadCalibration(service): Promise<CalibrationOffsets>` where `type CalibrationOffsets = Partial<Record<Criterion, number>>` and `type AnchorPair = { anchor: Partial<Record<Criterion, number>>; ai: Partial<Record<Criterion, number>> }`.
- Endpoint: `POST /api/admin/calibration` (admin-gated, no body) → refits from `admin_scores` joined to `scores.ai_breakdown`, upserts `scoring_calibration`, returns `{ sampleCount, offsets }`.

- [ ] **Step 1: Migration** — `supabase/migrations/20260712100000_scoring_calibration.sql`:

```sql
-- Per-criterion additive bias corrections, fitted from admin_scores human
-- anchors vs the LLM breakdown of the same performances. Service-role only.
create table public.scoring_calibration (
  criterion    text primary key,
  offset_value numeric not null check (offset_value between -10 and 10),
  sample_count integer not null,
  fitted_at    timestamptz not null default now()
);
alter table public.scoring_calibration enable row level security;
-- No policies: readable/writable only via service_role (bypasses RLS).
```

- [ ] **Step 2: Failing lib tests** — `apps/web/src/lib/calibration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyOffsets, computeOffsets } from './calibration';

const ai = {
  vocalAccuracy: 70,
  rhythmTiming: 70,
  toneQuality: 70,
  emotionInterpretation: 70,
  technicalSkill: 70,
  pronunciationDiction: 70,
  recordingQuality: 70,
  originality: 70,
  stagePresence: 70,
};

describe('computeOffsets', () => {
  it('returns empty below 5 anchor pairs (never fit on noise)', () => {
    expect(computeOffsets([{ anchor: { vocalAccuracy: 90 }, ai }]).offsets).toEqual({});
  });
  it('mean(anchor − ai) per criterion, clamped to ±10', () => {
    const pairs = Array.from({ length: 5 }, () => ({
      anchor: { vocalAccuracy: 95, toneQuality: 40 },
      ai,
    }));
    const { offsets, sampleCount } = computeOffsets(pairs);
    expect(sampleCount).toBe(5);
    expect(offsets.vocalAccuracy).toBe(10); // +25 clamped to +10
    expect(offsets.toneQuality).toBe(-10); // −30 clamped to −10
    expect(offsets.rhythmTiming).toBeUndefined(); // anchor never rated it
  });
});

describe('applyOffsets', () => {
  it('shifts only calibrated criteria, clamps 0..100, recomposes the initial score', () => {
    const out = applyOffsets({ ...ai }, { vocalAccuracy: 10, recordingQuality: -10 }, true);
    expect(out.breakdown.vocalAccuracy).toBe(80);
    expect(out.breakdown.recordingQuality).toBe(60);
    expect(out.breakdown.toneQuality).toBe(70);
    // recomposed: 70 + 0.20*10 − 0.07*10 = 71.3
    expect(out.initialAiScore).toBeCloseTo(71.3, 2);
  });
  it('empty offsets are the identity', () => {
    const out = applyOffsets({ ...ai }, {}, true);
    expect(out.initialAiScore).toBe(70);
  });
});
```

- [ ] **Step 3: Implement lib** — `apps/web/src/lib/calibration.ts`:

```ts
import 'server-only';
import {
  clamp,
  composeInitialAiScore,
  CRITERIA,
  type CriteriaScores,
  type Criterion,
} from '@voxscore/scoring';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;
export type CalibrationOffsets = Partial<Record<Criterion, number>>;
export interface AnchorPair {
  anchor: Partial<Record<Criterion, number>>;
  ai: Partial<Record<Criterion, number>>;
}

const MIN_PAIRS = 5;
const MAX_OFFSET = 10;

/** Mean(anchor − ai) per criterion over pairs where BOTH sides rated it. */
export function computeOffsets(pairs: readonly AnchorPair[]): {
  offsets: CalibrationOffsets;
  sampleCount: number;
} {
  if (pairs.length < MIN_PAIRS) return { offsets: {}, sampleCount: pairs.length };
  const offsets: CalibrationOffsets = {};
  for (const c of CRITERIA) {
    const deltas = pairs
      .map((p) =>
        typeof p.anchor[c] === 'number' && typeof p.ai[c] === 'number'
          ? (p.anchor[c] as number) - (p.ai[c] as number)
          : null,
      )
      .filter((d): d is number => d !== null);
    if (deltas.length < MIN_PAIRS) continue;
    const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    offsets[c] = clamp(Math.round(mean * 100) / 100, -MAX_OFFSET, MAX_OFFSET);
  }
  return { offsets, sampleCount: pairs.length };
}

/** Shift the LLM breakdown by the fitted offsets and recompose the start score. */
export function applyOffsets(
  breakdown: CriteriaScores,
  offsets: CalibrationOffsets,
  hasVideo: boolean,
): { breakdown: CriteriaScores; initialAiScore: number } {
  const adjusted = { ...breakdown };
  for (const c of CRITERIA) {
    const off = offsets[c];
    if (typeof off === 'number') adjusted[c] = clamp(adjusted[c] + off, 0, 100);
  }
  return { breakdown: adjusted, initialAiScore: composeInitialAiScore(adjusted, { hasVideo }) };
}

/** Load the fitted offsets (empty map when the table is empty). */
export async function loadCalibration(service: ServiceClient): Promise<CalibrationOffsets> {
  const { data } = await service.from('scoring_calibration').select('criterion, offset_value');
  const offsets: CalibrationOffsets = {};
  for (const row of data ?? []) offsets[row.criterion as Criterion] = Number(row.offset_value);
  return offsets;
}
```

Also add `scoring_calibration: { criterion: string; offset_value: number; sample_count: number; fitted_at: Timestamp; }` to `packages/db/src/types.ts` `PublicRows`.

- [ ] **Step 4: Refit endpoint** — `apps/web/src/app/api/admin/calibration/route.ts` (mirror the admin-gate idiom of `apps/web/src/app/api/admin/calibrate/route.ts:17-23`):

```ts
import type { Criterion } from '@voxscore/scoring';
import { computeOffsets, type AnchorPair } from '@/lib/calibration';
import { getProfileForContext } from '@/lib/auth';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';

/** Admin: refit per-criterion calibration offsets from admin_scores anchors. */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: anchors, error } = await service
    .from('admin_scores')
    .select('performance_id, criteria');
  if (error) return Response.json({ error: 'Could not load anchors' }, { status: 500 });

  const perfIds = [...new Set((anchors ?? []).map((a) => a.performance_id))];
  const { data: scoreRows } = perfIds.length
    ? await service
        .from('scores')
        .select('performance_id, ai_breakdown')
        .in('performance_id', perfIds)
    : { data: [] };
  const aiByPerf = new Map((scoreRows ?? []).map((s) => [s.performance_id, s.ai_breakdown]));

  const pairs: AnchorPair[] = (anchors ?? [])
    .map((a) => ({
      anchor: (a.criteria ?? {}) as Partial<Record<Criterion, number>>,
      ai: (aiByPerf.get(a.performance_id) ?? {}) as Partial<Record<Criterion, number>>,
    }))
    .filter((p) => Object.keys(p.ai).length > 0);

  const { offsets, sampleCount } = computeOffsets(pairs);
  for (const [criterion, offset] of Object.entries(offsets)) {
    await service.from('scoring_calibration').upsert(
      {
        criterion,
        offset_value: offset,
        sample_count: sampleCount,
        fitted_at: new Date().toISOString(),
      },
      { onConflict: 'criterion' },
    );
  }
  return Response.json({ sampleCount, offsets });
}
```

Route tests (`route.test.ts`): 403 non-admin; refit happy path (mock service: 5 anchors → upsert called per criterion with clamped value); empty anchors → `{ sampleCount: 0, offsets: {} }` and no upserts. Follow the mock idiom of `apps/web/src/app/api/admin/calibrate/route.test.ts`.

- [ ] **Step 5: Wire application points** — in `apps/web/src/lib/performance-create.ts` right after the provider result, and identically in the rescore route after `provider.score(...)`:

```ts
const calibration = await loadCalibration(service);
const calibrated = applyOffsets(scoring.breakdown, calibration, /* hasVideo: */ true);
// use calibrated.breakdown as ai_breakdown and calibrated.initialAiScore as initial_ai_score
```

(In `performance-create.ts` the performance is always a YouTube embed with video → `hasVideo: true`, matching `buildPerformanceCreate`'s current input. In `rescore/route.ts` use `perf.has_video`.) Adjust both call sites' insert/update payloads to use the calibrated values, and extend their existing tests: add a `scoring_calibration` branch to the service-client mocks returning `{ data: [] }` (identity) so current expectations hold, plus ONE new test per file with a non-empty offsets row asserting the shifted score is persisted.

- [ ] **Step 6: Green + commit**

```bash
git add supabase/migrations/20260712100000_scoring_calibration.sql apps/web/src/lib/calibration.ts apps/web/src/lib/calibration.test.ts "apps/web/src/app/api/admin/calibration/" packages/db/src/types.ts apps/web/src/lib/performance-create.ts apps/web/src/lib/performance-create.test.ts apps/web/src/app/api/admin/rescore/route.ts apps/web/src/app/api/admin/rescore/route.test.ts
git commit -m "feat(scoring): calibration v1 — human anchors correct the LLM prior"
```

### Task T6: Public caption transcript feeds the prior (best-effort)

**Files:**

- Modify: `packages/core/src/youtube.ts` (add `fetchCaptionText`)
- Test: `packages/core/src/youtube.test.ts`
- Modify: `apps/web/src/lib/performance-create.ts`, `apps/web/src/app/api/admin/rescore/route.ts` (pass `transcript`)

**Interfaces:**

- Produces: `fetchCaptionText(videoId: string, lang?: string): Promise<string | null>` — public timedtext metadata only (LEGAL: text metadata, never media). Returns null on any failure/absence; capped at 1500 chars.

- [ ] **Step 1: Failing tests** — append to `packages/core/src/youtube.test.ts` (mock global fetch):

```ts
describe('fetchCaptionText — public captions as scoring metadata', () => {
  it('strips XML and entity-escapes into plain text, capped at 1500 chars', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          `<?xml version="1.0"?><transcript><text start="0">Hello &amp; welcome</text><text start="2">it&#39;s me</text></transcript>`,
      })),
    );
    await expect(fetchCaptionText('dQw4w9WgXcQ')).resolves.toBe("Hello & welcome it's me");
    vi.unstubAllGlobals();
  });
  it('returns null when captions are absent or the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '' })),
    );
    await expect(fetchCaptionText('x')).resolves.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      }),
    );
    await expect(fetchCaptionText('x')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Implement** — append to `packages/core/src/youtube.ts`:

```ts
/**
 * Best-effort public caption text for a video (YouTube timedtext endpoint —
 * plain TEXT metadata, never audio/video; may legitimately be empty for many
 * videos). Used only to enrich the provisional LLM estimate.
 */
export async function fetchCaptionText(videoId: string, lang = 'en'): Promise<string | null> {
  try {
    const res = await fetch(
      `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(videoId)}`,
    );
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.includes('<text')) return null;
    const text = xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, 1500) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Wire both scoring call sites** — in `performance-create.ts` add `fetchCaptionText(videoId)` to the existing `Promise.all` (a 4th parallel read) and pass `transcript: caption ?? undefined` into `getScoringProvider().score({...})`; same pattern in the rescore route (sequential is fine there). Extend the two test files' mocks: `vi.mock('@voxscore/core')` partial already exists in `performance-create.test.ts` — add `fetchCaptionText: vi.fn(async () => null)` beside `fetchOEmbed`, plus one test asserting the provider receives a transcript when the mock returns text.

- [ ] **Step 4: Green + commit**

```bash
git add packages/core/src/youtube.ts packages/core/src/youtube.test.ts apps/web/src/lib/performance-create.ts apps/web/src/lib/performance-create.test.ts apps/web/src/app/api/admin/rescore/route.ts apps/web/src/app/api/admin/rescore/route.test.ts
git commit -m "feat(scoring): public caption transcript enriches the provisional estimate"
```

### Task T7: Battle semantics — one Elo update per battle, provisional K

**Files:**

- Create: `supabase/migrations/20260712110000_battle_close.sql`
- Create: `apps/web/src/app/api/cron/close-battles/route.ts`
- Create: `apps/web/src/app/api/cron/close-battles/route.test.ts`
- Modify: `apps/web/src/app/api/battles/vote/route.ts` (votes no longer apply Elo; closed battles reject votes)
- Modify: `apps/web/src/app/api/battles/vote/route.test.ts`
- Modify: `vercel.json` (add daily cron `0 7 * * *`)
- Modify: `packages/db/src/types.ts` (battles gains `closed_at: Timestamp | null`)

**Interfaces:**

- Consumes: existing SQL `apply_battle_result(p_perf_a uuid, p_perf_b uuid, p_result_for_a numeric, p_k numeric default 32)` — already accepts fractional results and a K override; NO SQL change needed to it.
- Produces: cron `GET /api/cron/close-battles` (CRON_SECRET bearer) closing battles older than 24h: `result_for_a = votesA/total` over `battle_votes` with `is_verified = true`; `K = 48` when `min(battle_count_a, battle_count_b) < 5` else `24`; majority winner's owner gets the `battle_champion` badge (skip on exact tie); zero-vote battles close silently with no Elo change.

- [ ] **Step 1: Migration** — `supabase/migrations/20260712110000_battle_close.sql`:

```sql
-- One Elo update per battle (applied at close), not per vote.
alter table public.battles add column closed_at timestamptz;
create index battles_open_created_idx on public.battles (created_at) where status = 'open';
```

- [ ] **Step 2: Strip per-vote Elo from the vote route** — in `apps/web/src/app/api/battles/vote/route.ts`: (a) extend the battle select to `('id, perf_a, perf_b, status')` and return `409 { error: 'Battle already closed' }` when `battle.status === 'closed'`; (b) DELETE the entire post-insert service block that calls `apply_battle_result` + winner badge (lines ~75-109) — keep `trackServer('battle_completed', ...)` firing right after the successful insert, using the service client if available; response becomes `Response.json({ ok: true }, { status: 201 })` always. Update `route.test.ts`: drop the rating-returned assertions, add `409 on closed battle` and `does NOT call apply_battle_result on vote` tests.

- [ ] **Step 3: Failing cron tests** — `close-battles/route.test.ts` (mock `@/lib/supabase/server`, `@/lib/badges`):

```ts
it('403 without the cron bearer secret', ...);
it('closes a zero-vote stale battle without touching Elo', ...); // update status only; rpc not called
it('applies ONE margin-weighted update with provisional K=48 for new performances', async () => {
  // battle 30h old; votes: 3 for A, 1 for B (is_verified); battle_counts a=2,b=7
  // expect rpc('apply_battle_result', { p_perf_a, p_perf_b, p_result_for_a: 0.75, p_k: 48 })
  // expect grantBadge(service, ownerA, 'battle_champion')
});
it('skips the badge on an exact tie but still applies result 0.5', ...);
```

- [ ] **Step 4: Implement the cron** — `apps/web/src/app/api/cron/close-battles/route.ts`:

```ts
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { grantBadge } from '@/lib/badges';

const BATTLE_WINDOW_H = 24;
const BATCH = 50;
const K_PROVISIONAL = 48;
const K_ESTABLISHED = 24;
const PROVISIONAL_BATTLES = 5;

/** Close battles older than the window: ONE margin-weighted Elo update each. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const cutoff = new Date(Date.now() - BATTLE_WINDOW_H * 3600_000).toISOString();
  const { data: stale, error } = await service
    .from('battles')
    .select('id, perf_a, perf_b')
    .eq('status', 'open')
    .lt('created_at', cutoff)
    .limit(BATCH);
  if (error) return Response.json({ error: 'Could not load battles' }, { status: 500 });

  let closed = 0,
    applied = 0;
  for (const b of stale ?? []) {
    const { data: votes } = await service
      .from('battle_votes')
      .select('winner_performance_id')
      .eq('battle_id', b.id)
      .eq('is_verified', true);
    const total = votes?.length ?? 0;

    if (total > 0) {
      const votesA = (votes ?? []).filter((v) => v.winner_performance_id === b.perf_a).length;
      const resultForA = votesA / total;

      const { data: perfs } = await service
        .from('performances')
        .select('id, user_id, battle_count')
        .in('id', [b.perf_a, b.perf_b]);
      const a = perfs?.find((p) => p.id === b.perf_a);
      const pB = perfs?.find((p) => p.id === b.perf_b);
      const k =
        Math.min(a?.battle_count ?? 0, pB?.battle_count ?? 0) < PROVISIONAL_BATTLES
          ? K_PROVISIONAL
          : K_ESTABLISHED;

      await service.rpc('apply_battle_result', {
        p_perf_a: b.perf_a,
        p_perf_b: b.perf_b,
        p_result_for_a: resultForA,
        p_k: k,
      });
      applied++;

      if (resultForA !== 0.5) {
        const winnerOwner = resultForA > 0.5 ? a?.user_id : pB?.user_id;
        if (winnerOwner) await grantBadge(service, winnerOwner, 'battle_champion');
      }
    }
    await service
      .from('battles')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', b.id);
    closed++;
  }
  return Response.json({ closed, applied });
}
```

Note: `apply_battle_result` currently also increments `battle_wins` by `case when p_result_for_a = 1 then 1 else 0 end` — with fractional results a majority win of 0.75 would not count as a "win". Extend the SAME migration (Step 1 file) with a replacement of `apply_battle_result` that changes only those two case-expressions to `case when p_result_for_a > 0.5 then 1 else 0 end` (A) / `case when p_result_for_a < 0.5 then 1 else 0 end` (B), keeping everything else byte-identical to `supabase/migrations/20260624120000_security_hardening.sql:77-122`.

- [ ] **Step 5: vercel.json** — append `{ "path": "/api/cron/close-battles", "schedule": "0 7 * * *" }` to the `crons` array.

- [ ] **Step 6: Green + commit**

```bash
git add supabase/migrations/20260712110000_battle_close.sql "apps/web/src/app/api/cron/close-battles/" apps/web/src/app/api/battles/vote/route.ts apps/web/src/app/api/battles/vote/route.test.ts vercel.json packages/db/src/types.ts
git commit -m "feat(battles): close-at-24h with one margin-weighted Elo update, provisional K"
```

### Task A1: Signup bot check (Supabase Auth CAPTCHA + widget)

**Files:**

- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/messages/{en,tr,zh,hi,es,fr,ar}.json` (`Login.captchaFailed`)
- Test: none new (client widget; covered by manual verify) — **Ops:** enable "Cloudflare Turnstile" in Supabase Dashboard → Auth → Settings → Bot and Abuse Protection, with the SAME site/secret pair as `TURNSTILE_SECRET_KEY` (already in `.env.example`).

**Interfaces:** `supabase.auth.signUp({ email, password, options: { captchaToken } })` — Supabase verifies the token server-side once the dashboard toggle is on. Google OAuth path is untouched (Google's own bot resistance).

- [ ] **Step 1: Widget on the signup mode** — in `login/page.tsx` add state `const [captchaToken, setCaptchaToken] = useState('')`, render inside the form ONLY when `mode === 'signup'`:

```tsx
<div
  className="cf-turnstile"
  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
  data-callback="onVsTurnstile"
/>
```

load the script once post-mount and register the callback:

```tsx
useEffect(() => {
  (window as unknown as Record<string, unknown>).onVsTurnstile = (t: string) => setCaptchaToken(t);
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  s.async = true;
  document.head.appendChild(s);
  return () => {
    s.remove();
  };
}, []);
```

and pass the token: `supabase.auth.signUp({ email, password, options: { captchaToken } })`. When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (local dev), skip rendering the widget and omit `options` (unchanged behavior).

- [ ] **Step 2: i18n** — add `"captchaFailed": "Bot check failed — please retry."` under `Login` in all 7 message files (translate per-locale in the same style as neighboring keys) and surface Supabase's captcha error via the existing `setError(authError.message)` path.

- [ ] **Step 3: Verify + commit** — `pnpm typecheck && pnpm lint && pnpm --filter @voxscore/web build`, manual signup on preview shows the widget:

```bash
git add apps/web/src/app/login/page.tsx apps/web/messages/
git commit -m "feat(auth): Turnstile bot check on email signup"
```

### Task A2: Listen concurrency cap + daily vote cap

**Files:**

- Modify: `apps/web/src/app/api/listens/start/route.ts`
- Modify: `apps/web/src/app/api/listens/start/route.test.ts`
- Modify: `apps/web/src/app/api/votes/route.ts`
- Modify: `apps/web/src/app/api/votes/route.test.ts`

**Interfaces:** none new — two server-side guards. Constants: `MAX_OPEN_LISTENS = 3` (open = `is_valid=false`, created in the last 30 min), `MAX_VOTES_PER_DAY = 50`.

Why: the verified-listen time-anchor is the core anti-bot cost, but a single account can open unlimited PARALLEL listens and pay the wall-clock cost once for all of them. Capping open sessions at 3 restores the per-listen time cost; the daily vote cap bounds any残 remaining farm throughput.

- [ ] **Step 1: Failing tests** — `listens/start/route.test.ts` add:

```ts
it('429 when the user already has 3 open listen sessions (parallel-farm guard)', async () => {
  // mock: count query on verified_listens (is_valid=false, created_at > now-30m, user) returns 3
  // expect status 429 and NO insert
});
```

`votes/route.test.ts` add:

```ts
it('429 after 50 votes in 24h (velocity cap), before any insert', async () => { ... });
```

- [ ] **Step 2: Implement listens guard** — in `listens/start/route.ts`, after auth+rate-limit and before the insert:

```ts
const MAX_OPEN_LISTENS = 3;
const openSince = new Date(Date.now() - 30 * 60_000).toISOString();
const { count: openCount } = await supabase
  .from('verified_listens')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('is_valid', false)
  .gt('created_at', openSince);
if ((openCount ?? 0) >= MAX_OPEN_LISTENS) {
  return Response.json(
    { error: 'Too many listening sessions in progress — finish one first' },
    { status: 429 },
  );
}
```

- [ ] **Step 3: Implement vote velocity cap** — in `votes/route.ts` after the listen check, before the ratings insert:

```ts
const MAX_VOTES_PER_DAY = 50;
const daySince = new Date(Date.now() - 24 * 3600_000).toISOString();
const { count: recentVotes } = await supabase
  .from('criteria_ratings')
  .select('id', { count: 'exact', head: true })
  .eq('voter_id', user.id)
  .gt('created_at', daySince);
if ((recentVotes ?? 0) >= MAX_VOTES_PER_DAY) {
  return Response.json({ error: 'Daily voting limit reached' }, { status: 429 });
}
```

- [ ] **Step 4: Green + commit**

```bash
git add apps/web/src/app/api/listens/start/ apps/web/src/app/api/votes/
git commit -m "feat(anti-bot): parallel-listen cap (3) and daily vote cap (50)"
```

### Task T8: Wave-1 release runbook (operator steps — no code)

- [ ] 1. Merge the Wave-1 PR(s); `vercel --prod` from repo root; confirm `READY`.
- [ ] 2. Apply, in the Supabase SQL editor, in order: `20260712090000_score_regime_v4.sql`, `20260712100000_scoring_calibration.sql`, `20260712110000_battle_close.sql`. Each must print "Success".
- [ ] 3. Enable Turnstile in Supabase Auth settings (Task A1 ops note).
- [ ] 4. League-wide rescore to regime v4 — as the admin on voxscore.app, DevTools console:

```js
for (let i = 0; i < 12; i++) {
  const r = await fetch('/api/admin/rescore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"limit":4}',
  });
  const j = await r.json();
  console.log(i + 1, j);
  if (!j.remaining) {
    console.log('DONE');
    break;
  }
}
```

**Note:** the current rescore route only targets `ai_provider='mock'` rows. Regime bumps need everything below the current version — extend the rescore route's queue filter from `.eq('ai_provider','mock')` to `.or('ai_provider.eq.mock,scoring_version.lt.' + SCORING_VERSION)` (one-line change + one test: "queues rows below the current scoring version") as part of the T4 commit.

- [ ] 5. Sanity: `curl -s https://voxscore.app/performance/<pavarotti-id> | grep -o '<title>[^<]*'` — famous-performer scores should remain high but now for performance-signal reasons; clickbait titles (e.g. "Best Ever Cover … X Factor") should drop.

---

# WAVE 2 — Trust, robustness, transparency

### Task T9: Voter reputation v1 → `criteria_ratings.weight` finally live

**Files:**

- Create: `apps/web/src/app/api/cron/refresh-reputation/route.ts` (+ `route.test.ts`)
- Modify: `apps/web/src/app/api/votes/route.ts` (insert `weight` from voter's reputation)
- Modify: `vercel.json` (cron `30 7 * * *`)

**Interfaces:**

- Storage: reuse dormant `profiles.reputation` (int) as `round(weight × 1000)`; default 0 is interpreted as weight 1.0 (`weightFromReputation(0) === 1`).
- Produces: `weightFromReputation(rep: number): number` in a new `apps/web/src/lib/reputation.ts`: `rep <= 0 ? 1 : clamp(rep / 1000, 0.5, 1.5)`.

- [ ] **Step 1: lib + tests** — `reputation.ts` with the 3-line function above; tests: 0→1, 500→0.5, 1500→1.5, 2000→1.5 (clamped).
- [ ] **Step 2: votes route** — read the voter's `profiles.reputation` (single select) and include `weight: weightFromReputation(rep)` in the `criteria_ratings` insert. Test: insert payload contains the mapped weight.
- [ ] **Step 3: nightly refit cron** — for each voter with ≥3 ratings: `mad = avg(|voter_overall − performance.listener_score|)` over their rated performances that have ≥5 votes (consensus exists); `weight = clamp(1.5 − mad/25, 0.5, 1.5)`; `update profiles set reputation = round(weight*1000)`. Compute in TS over service-role reads (voter overalls via the same weighted formula as `criteriaOverall`; batch voters 200/run). CRON_SECRET auth, tests: 403; skips voters with <3 ratings; writes clamped reputation.
- [ ] **Step 4: commit** — `feat(trust): voter reputation v1 drives criteria_ratings.weight`.

### Task T10: Trimmed listener mean at scale (RPC v5)

**Files:** Create `supabase/migrations/20260712120000_score_trimmed_mean.sql`; extend `packages/scoring/src/sql-parity.test.ts` to point at the NEWEST regime file.

- [ ] Replace the RPC's aggregate with a CTE that, when `count(*) >= 10`, drops the top and bottom `floor(count*0.1)` per-vote overalls (by `row_number() over (order by overall)`) before the weighted average; below 10 votes behavior is unchanged. Everything else byte-identical to the T3 body. Commit: `feat(scoring): 10% trimmed listener mean at n>=10 (RPC v5)`.

### Task T11: Confidence v2 — show a real interval

**Files:** RPC v5 (same migration as T10) also returns/stores `listener_stddev` (add `numeric` column to `scores` in that migration: `alter table public.scores add column listener_stddev numeric;` + `stddev_samp` of the per-vote overalls); modify `apps/web/src/components/score-breakdown.tsx` to render `±(1.96·sd/√n)` (1dp) next to the score when `n ≥ 5`; new i18n key `Performance.scoreInterval: "±{margin}"` in 7 locales; `packages/db/src/types.ts` gains `listener_stddev: number | null`. Tests: a small pure helper `confidenceMargin(sd, n)` in `packages/scoring/src/confidence.ts` (`n<5 or sd null → null; else round(1.96*sd/Math.sqrt(n),1)`) with 4 unit tests.

### Task T12: DSP toneQuality — spectral balance (the ADR's promised 5th measure)

**Files:** Modify `packages/dsp/src/features.ts` (radix-2 FFT ~40 lines + `spectralCentroidHz` mean over voiced frames), `packages/dsp/src/measure.ts` (map: `toneQuality = 100·clamp01(1 − |centroid − 2200| / 2200)`, added to `MEASURED_CRITERIA`), bump `DSP_VERSION` to 2 in `apps/web/src/app/api/measurements/route.ts`. Tests in `packages/dsp/src/features.test.ts` with the existing synthetic generators (`signals.ts`): pure 440 Hz sine → centroid ≈ 440 ±10; sine+bright harmonics → higher centroid; determinism (same bytes → same centroid).

### Task T13: "Duration-matched" Measured badge

**Files:** migration `20260712130000_measured_duration.sql` (`alter table public.measured_scores add column duration_matched boolean;`), `apps/web/src/app/api/measurements/route.ts` (fetch video duration via YouTube Data API `videos.list?part=contentDetails` when `YOUTUBE_API_KEY` is set — metadata only; compare to WAV duration within ±5% → write the flag; null when no key), UI chip in `score-breakdown.tsx` (`Performance.durationMatched: "Duration-matched"` ×7 locales). Tests: route test with mocked fetch (match, mismatch, no-key→null). **Ops:** create `YOUTUBE_API_KEY` in Vercel (also unlocks `pnpm curate:catalog`'s authoritative view counts).

### Task A3: IP-cluster brigade flags (+ privacy text)

**Files:** migration `20260712140000_listen_ip_hash.sql` (`alter table public.verified_listens add column ip_hash text;` + index `(ip_hash, created_at)`); `apps/web/src/app/api/listens/start/route.ts` stores `ip_hash = sha256(ANTI_ABUSE_SALT + clientIp)` (ip from `x-forwarded-for` first hop; skip when header absent; salt = new env `ANTI_ABUSE_SALT`, add to `.env.example`); new cron `/api/cron/flag-vote-bursts` (daily): for each performance with ≥5 votes in the last 24h, if ≥3 distinct voters share one `ip_hash` on their qualifying listens → insert `moderation_flags(target_type='performance', target_id, reporter_id=null, reason='auto: vote burst from a single network')` (dedupe: skip if an open auto-flag exists). Tests: hashing helper (same ip+salt → same hash; different salt → different), cron 403/flag/dedupe. **Docs:** update `/privacy` anti-abuse paragraph: "we store a salted, one-way hash of your network address for abuse detection; it cannot be reversed to your IP" (EN page; note for counsel review). Commit: `feat(anti-bot): salted IP-hash vote-burst flags for moderation`.

### Task A4: Referral conversions must be real users

**Files:** Modify `apps/web/src/app/auth/callback/route.ts` (badge threshold query) + `route.test.ts`.

- [ ] Replace the plain conversion count with "conversions whose invited user completed ≥1 valid verified listen": fetch `analytics_events(user_id) where event='invite_converted' and meta->>ref = ref`, then count how many of those `user_id`s appear in `verified_listens where is_valid = true` (two `.in()` queries, set intersection in TS). Badge only when that validated count ≥ `INVITER_BADGE_THRESHOLD`. Tests: 3 raw conversions but only 2 validated → no badge; 3 validated → badge.

---

# WAVE 3 — separate plans (do NOT start from this document)

Each of these is its own spec+plan when its prerequisite lands; listed here only so the roadmap is complete:

1. **Device attestation (N2b)** — Play Integrity / App Attest verification endpoint; unlocks native single-votes (removes the Turnstile block in `/api/votes` for attested devices) and becomes the reputation system's identity anchor. Prereq: store accounts.
2. **Pairwise fusion** — Bradley-Terry latent quality fitted nightly from closed battles; enters `current_score` as a third blend component `(AI, listener, pairwise)`. Prereq: ≥300 closed battles so the MLE is stable; needs its own SCORING_VERSION bump + rescore.
3. **Owned-upload full DSP** — melody alignment against a reference track for the user's OWN recording (legal: user-owned media), yielding a true note-accuracy measure and a "Verified Measured" tier. Prereq: upload storage + premium gating decisions.

---

## Self-review (done at authoring time)

- Spec coverage: fame bias→T4; dead calibration→T5; weight asymmetry→T2+T3; step tiers/duplication→T1+T3(parity test); per-vote Elo→T7; dormant weight column→T3(consumes)+T9(writes); transcript→T6; bots: signup→A1, parallel-listen/velocity→A2, network clustering→A3, referral fraud→A4; variance transparency→T11; DSP gaps→T12+T13. Rescore-queue gap for regime bumps → covered in T8's note (ships with T4's commit).
- Placeholder scan: every code step contains the actual code; W2 tasks T9–A4 are intentionally one-level less granular but contain exact formulas, files, constants, and test lists (no TBDs).
- Type consistency: `listenerWeightForVotes` (T1) used by `currentScore` (T1) only; `criteriaOverall` signature unchanged (T2) so `rowToOverall` and the RPC path stay consistent; `CalibrationOffsets`/`applyOffsets` names match between T5 lib, endpoint, and both wiring sites; `apply_battle_result(p_perf_a, p_perf_b, p_result_for_a, p_k)` matches the existing SQL signature.

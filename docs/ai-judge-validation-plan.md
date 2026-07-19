# AI Judge — Scientific Validation Program

> **STATUS: PLAN ONLY, no code in this document.** Written 2026-07-19. Maps to
> `docs/adr/0003-measured-vocal-scoring.md` (the "measure and delete" DSP
> pipeline) and `packages/dsp/src/ai-judge.ts` (YIN pitch tracking, DTW
> tempo-alignment, quality gate — see PR #62, "align AI Judge pitch metrics to
> tempo via DTW, not a linear clock").
>
> Per CLAUDE.md: "If unsure, say I cannot verify — do not guess." This plan
> identifies what validation work is _required_ before AI Judge's `ai_verified`
> badge can honestly claim "a fair, validated vocal score." It does not claim
> the current pipeline already meets that bar — it isn't validated yet, which
> is exactly the gap this program closes.

## Why this exists

`ai_verified` scores are technically sound (deterministic DSP math, unit-tested
against synthetic signals, a real quality gate that rejects low-confidence
takes) but "technically sound" and "scientifically validated against human
judgment" are different claims. Nothing here blocks the current product —
`ai_verified` badges keep shipping — but the product should not describe them
as more validated than they are until this program produces evidence.

## Phase 1 — Pitch engine benchmark (no user data required)

**Goal:** an accuracy report for the YIN-based pitch engine
(`packages/dsp/src/features.ts`) against open, commercially-compatible
datasets — establishing a baseline BEFORE any human-voice validation, since a
biased pitch engine invalidates everything built on top of it.

- Candidate datasets: MIR-1K (monophonic singing, pitch-annotated, research
  license — verify commercial-use terms before use), a cappella subsets of
  MedleyDB (mixed licensing per track — filter to CC-BY/permissive only),
  or synthetic sung-note generation (controlled ground truth, zero licensing
  risk, useful as a sanity floor even if not sufficient alone).
- **Hard constraint carried over from Hard Rule 7:** no Essentia, no madmom
  pretrained models, at any stage of this benchmark — the pitch engine under
  test is `packages/dsp`'s own YIN implementation; comparison baselines must
  use permissively-licensed reference tools only (e.g. `aubio`'s YIN/YINFFT
  for a sanity cross-check, not as a dependency).
- **Output:** median cent error, voicing recall/false-alarm rate, and
  degradation curves by SNR/vibrato depth — the same shape of numbers
  `AiJudgeRawMetrics` already emits, but now compared against ground truth
  instead of just internally self-consistent.
- **Acceptance bar to propose (confirm with the user before treating as
  final):** median cent error ≤ 25 cents on clean vocal-only material,
  consistent with published YIN literature — this is a starting proposal, not
  a claim already validated.

## Phase 2 — Consented benchmark dataset (≥50 recordings)

**Goal:** real human vocal recordings with informed consent, used only for
validating the scoring pipeline — never for training a model on someone's
voice without separate, explicit authorization.

Protocol:

1. **Consent text** (human/legal must review before use — do not treat this
   list as final): explicit purpose ("used to validate/calibrate VoxScore's
   automated vocal scoring, not for any other purpose"), retention period
   (propose 12 months, renewable), right to withdraw + deletion path, whether
   recordings may ever be used for model training (default: no, unless a
   _separate_ opt-in is added later).
2. **Collection:** volunteer performers (internal team + a paid or
   goodwill-compensated external pool) record a fixed short repertoire
   (2–3 known melodies with an existing `song_references` entry) so pitch
   ground truth is available from the reference melody, not just from
   independent transcription.
3. **Storage:** raw audio in a access-restricted bucket separate from
   production Supabase Storage, purge job tied to the consent-recorded
   retention period, `rights_basis`-equivalent field per recording (mirrors
   `song_references.source_type`'s existing `licensed_midi` /
   `admin_annotation` constraint — same pattern, new table).
4. **Target:** ≥50 recordings across a spread of vocal ranges, ages, and at
   least 2 languages (the product is explicitly global, not TR-only — see
   memory: launch decision was global-first).

## Phase 3 — Liveness + duplicate-audio rejection (codeable now)

These two are scoped enough to become real PRs without the rest of this
program completing first — proposing them as the **first PR**, pending your
approval before starting either:

### 3a. Duplicate-audio-hash rejection across accounts

**Gap found while writing this plan:** `apps/analyzer/src/server.ts:180`
already computes `audioSha256` for every upload and it's already persisted
(`measured_scores.audio_sha256` / equivalent columns, `packages/core/src/analysis.ts:143`
schema), but **nothing currently checks it** — `apps/web/src/app/api/internal/analysis-results/route.ts`
accepts and scores a result without ever querying for a prior row with the
same hash under a _different_ `user_id`. Today, two accounts could submit the
byte-identical WAV and both receive a full `ai_verified` score.

Proposed fix (small, one PR): before accepting a result in
`internal/analysis-results/route.ts`, query `measured_scores` (or wherever
`audio_sha256` lives) for an existing row with the same hash and a different
`user_id`; reject with a clear error if found. Same-user resubmission (retry
after a failed take) should stay allowed.

### 3b. Liveness challenge at recording time

**Gap:** no random per-session challenge exists today — a static pre-recorded
clip of a competitor's genuinely great performance could be replayed into the
mic. Proposed design: the mobile recording screen requests a short random
prompt (e.g., "say/sing today's 4-digit code" or "hum this random 3-note
pattern") from the server at recording start, the server embeds it in the
`analysis_sessions` challenge nonce (a nonce-hash mechanism already exists —
`apps/web/src/app/api/analysis/sessions/route.ts:88`, `apps/analyzer/src/server.ts:144`
— this extends that existing pattern rather than inventing a new one), and the
analyzer's quality gate additionally checks the prompt segment is present
near the recording start before accepting the take as live.

## Phase 4 — Reference melody rights basis

**Already implemented, no further PR needed:** `song_references.source_type`
(migration `20260716110000_publish_song_reference.sql`) is constrained to
`licensed_midi` or `admin_annotation` — this already IS the rights-basis field
this phase would otherwise propose. Verify during Phase 2 dataset build-out
that every `song_references` row used as ground truth actually has a
verifiable `licensed_midi` provenance record (a license file/receipt, not just
the DB constraint) — that paperwork trail is the part not yet audited.

## Phase 5 — Calibration study (300 recordings × ≥3 independent judges)

**Goal:** the actual human-agreement benchmark — does the AI Judge score
correlate with what real judges (music teachers, working vocalists) say.

- **Design:** 300 recordings (the Phase 2 pool won't reach this alone —
  budget for a second collection round, or partner with a vocal coaching
  platform/school under the same consent protocol as Phase 2).
- **≥3 independent human judges per recording**, blind to the AI score,
  scoring the same 9 criteria (or a reduced core subset — vocalAccuracy,
  rhythmTiming, toneQuality, technicalSkill map most directly to what DSP
  measures) on the same 0–100 scale.
- **Cost estimate (rough, confirm before committing budget):** at a
  conservative $15–25/recording/judge honorarium, 300 × 3 × $20 ≈ **$18,000**,
  plus recruiting/logistics overhead — this is the single largest line item
  in the whole program and the one most worth getting a second opinion on
  before committing.
- **Analysis:** Spearman correlation + MAE between AI Judge score and the
  median human judge score, per criterion and overall.
- **Proposed acceptance threshold (not yet validated, propose for
  discussion):** Spearman ρ ≥ 0.7 overall before removing the "beta" framing
  from measured scores; below that, keep shipping but keep the qualifier.

## Phase 6 — Bias analysis

Once Phase 5 data exists, break down AI-vs-human agreement by:

- **Language** (the product is global — an English-tuned pitch/rhythm heuristic
  could silently under- or over-score tonal languages or non-Latin phonetic
  patterns).
- **Device/mic quality** (the SNR/clipping quality gate already filters the
  worst cases, but a systematic score gap between phone-mic and studio-mic
  submissions would be a fairness problem even after the gate passes).
- **Vocal range/register** (bass vs soprano — YIN's pitch confidence and octave
  errors are register-dependent in the literature; verify this product's
  implementation isn't silently penalizing one range).

Any statistically significant gap found here needs its own remediation PR
(recalibration, not necessarily a rewrite) before being called resolved.

## Phase 7 — UI labeling requirement until this program completes

Until Phase 5's threshold is met (or explicitly revised), these screens should
keep the current provisional/measured framing rather than upgrading to
unqualified language:

- Mobile `measure/[performanceId].tsx` result screen and the "Measured" badge
  wherever it renders (performance detail, profile, leaderboards) — current
  copy is already appropriately hedged ("measured from the artist's submitted
  recording," per ADR 0003 §"Labeling") — no regression found, just confirming
  it should stay this way, not be strengthened, until Phase 5 lands.
- Any future marketing copy claiming AI Judge is "scientifically validated" or
  "as accurate as a human judge" should not ship before Phase 5's actual
  numbers exist to back it.

## Sequencing recommendation

1. **Phase 3 (3a + 3b)** — codeable now, small, real anti-abuse value
   independent of the rest of this program. Propose as the next PR; I will
   not start it without your explicit go-ahead per-item (3a and 3b are
   separable — you may want only one).
2. **Phase 1** — no user data needed, can start anytime, informs whether
   Phase 5 is even worth funding (a badly biased pitch engine should be fixed
   before spending the Phase 5 budget on it).
3. **Phase 2 → Phase 5 → Phase 6** — the long pole. Phase 2's consent/legal
   text needs human/legal review before any recruiting starts (CLAUDE.md: "If
   unsure, say I cannot verify — do not guess laws.").
4. **Phase 4** — already done; only a paperwork audit remains, can happen
   alongside Phase 2.
5. **Phase 7** — not a phase to "do," a standing constraint that stays in
   force until Phase 5 produces numbers.

## Explicitly out of scope for this document

This plan does not decide the Phase 5 acceptance threshold, the Phase 2
consent language, or the Phase 5 budget — those are flagged above as
decisions for you (and, for consent language, legal counsel), not defaults
I've silently chosen.

# ADR 0003 — Measured vocal scoring: analyze-and-delete DSP on user-owned recordings

Date: 2026-07-10 · Status: accepted

## Context

The product's AI score for YouTube-linked performances is, by design, a
metadata-only **estimate** ("Provisional AI Estimate"). It can never become a
real audio measurement because Hard Rule 1 (CLAUDE.md) forbids downloading or
DSP-analyzing YouTube media — a legal constraint (YouTube ToS + copyright), not
a technical one. The founder decision (2026-07-10) is: **we must offer real,
honest, audio-based scoring**, under three constraints:

1. The YouTube no-download rule stays absolute.
2. Near-zero infrastructure cost.
3. Scores must be honest — measured numbers labeled as measured, estimates
   labeled as estimates (Hard Rule 6: objective numbers only from real DSP).

## Decision — the "measure and delete" model

Real measurement applies only to recordings the performer **owns and submits
themselves** (Hard Rule 3), via this pipeline:

```
in-app recording (performer's own voice, uncompressed WAV/PCM)
        │  upload for ANALYSIS ONLY
        ▼
server-side DSP  ──►  measured features + sub-scores stored (scores tables)
        │
        ▼
audio file DELETED immediately after analysis
```

- **Public listening stays on the YouTube embed** — we never host or stream
  performance audio. The upload exists solely to be measured.
- **Deleting the audio after analysis** is what makes all three constraints
  hold at once: no storage/egress cost growth, no hosting/streaming of a
  copyrighted composition (the performer owns the master; the underlying song
  rights never become our distribution problem because we never distribute),
  and no growing PII/audio retention surface.
- **Labeling:** DSP-derived criteria surface as **“Measured”**; everything
  else keeps **“Provisional AI Estimate”**. A performance with an attached
  measurement shows which criteria are measured vs estimated. The measurement
  is honest about its own provenance: it describes the uploaded recording (we
  cannot verify the upload is the same take as the linked video — the badge
  copy must say “measured from the artist's submitted recording”).

## What DSP measures vs what stays interpretive (Hard Rule 6 split)

| Criterion                                                               | Source                 | Signal                                                 |
| ----------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| vocalAccuracy (proxy: pitch control)                                    | **Measured**           | YIN pitch track → voiced-frame pitch stability         |
| rhythmTiming (proxy: timing steadiness)                                 | **Measured**           | onset intervals → tempo regularity                     |
| technicalSkill (proxy: vibrato control)                                 | **Measured**           | pitch-track modulation rate/extent in the vibrato band |
| recordingQuality                                                        | **Measured**           | SNR estimate + clipping rate                           |
| toneQuality (partial)                                                   | **Measured**           | spectral balance of voiced frames                      |
| emotionInterpretation, originality, pronunciationDiction, stagePresence | Estimate / human votes | LLM + verified-listen community votes (unchanged)      |

Community verified-listen votes continue to blend over every criterion exactly
as today — measurement replaces the _AI estimate_ for measurable criteria, not
the human layer.

## Implementation choices

- **`packages/dsp`** — pure, dependency-free, fully-tested TypeScript. WAV/PCM
  parsing, YIN pitch tracking, feature extraction, and score mapping are
  hand-rolled: no AGPL/non-commercial licensing exposure (Hard Rule 7 bans
  Essentia/madmom; we go further and take no runtime DSP dependency at all),
  and the math is provable with synthetic-signal unit tests (a 440 Hz sine
  must track at 440 Hz; noise must score low SNR).
- **Input format is uncompressed WAV/PCM, 16-bit mono, 16–48 kHz**, recorded
  in-app. Pure-TS decoding of AAC/M4A is not viable; WAV keeps the entire
  pipeline dependency-free and deterministic. Upload size for a 3-minute take
  at 16 kHz mono ≈ 5.5 MB — acceptable for a one-shot analysis upload.
- **Analysis runs server-side** (API route/worker on the existing free-tier
  infrastructure), never on the client, so measured scores cannot be forged by
  a modified app. Uploaded bytes are analyzed in memory / temp storage and
  discarded; only features and sub-scores persist.
- **Determinism:** same file → same numbers, always. No sampling, no model
  calls. This is the "same score every time" guarantee taken to its ideal.

## Rollout increments

1. `packages/dsp` measurement engine (this ADR's PR) — the provable core.
2. `/api/measurements` upload-analyze-delete endpoint + `measured_scores`
   storage + score-blend integration.
3. Mobile in-app recording screen (expo WAV capture) + “Measured” badge UI.
4. (Later) richer features: note-onset pitch accuracy against detected key,
   phrase-level dynamics.

## Consequences

- Zero new infrastructure cost at launch scale; CPU cost of analysis is
  seconds per upload on existing compute.
- We never enter the audio-hosting business; YouTube remains the only
  distribution surface (Hard Rules 1–2 untouched).
- The league gains an honest second tier: estimated (YouTube link) vs
  measured (own recording) — clearly labeled, never conflated.

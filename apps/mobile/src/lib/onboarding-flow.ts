import { CRITERIA, type Criterion } from '@voxscore/scoring';

/**
 * Onboarding v2 — pure flow logic and radar geometry.
 *
 * Kept free of React Native imports so it runs under Vitest (node env). The
 * onboarding screen renders the visuals; this module owns the branching rules
 * and the trigonometry, which are the only parts worth unit-testing.
 */

/** The three first-move intents the user picks on the "Niyet" screen. */
export type IntentId = 'singer' | 'juror' | 'explorer';

export const INTENTS: readonly IntentId[] = ['singer', 'juror', 'explorer'] as const;

/**
 * Where each intent drops the user after onboarding completes. Mirrors the
 * design notes ("→ /add", "→ /battle", "→ /"). Explorer lands on the public
 * leaderboard (home), which needs no account.
 */
export const INTENT_ROUTES: Record<IntentId, '/add' | '/battle' | '/'> = {
  singer: '/add',
  juror: '/battle',
  explorer: '/',
};

export function routeForIntent(intent: IntentId): '/add' | '/battle' | '/' {
  return INTENT_ROUTES[intent];
}

/**
 * Illustrative per-criterion scores for the onboarding radar (0–100), in
 * `CRITERIA` order. Demo data only — the real product computes these. Tuned to
 * sit around the DEMO_OVERALL shown in the center of the chart.
 */
export const DEMO_CRITERIA_SCORES: Record<Criterion, number> = {
  vocalAccuracy: 88,
  rhythmTiming: 82,
  toneQuality: 88,
  emotionInterpretation: 87,
  technicalSkill: 85,
  pronunciationDiction: 85,
  recordingQuality: 84,
  originality: 87,
  stagePresence: 86,
};

/** The number shown in the center of the radar. */
export const DEMO_OVERALL = 86;

/** Demo scores as an array in CRITERIA order (handy for radar rendering). */
export const DEMO_SCORES_ORDERED: number[] = CRITERIA.map((c) => DEMO_CRITERIA_SCORES[c]);

export interface Point {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * `count` evenly spaced points on a circle (radius `r`, center `cx,cy`),
 * starting at 12 o'clock and proceeding clockwise. Used for radar axis tips and
 * gridline vertices.
 */
export function polarPoints(count: number, r: number, cx: number, cy: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/**
 * Radar data vertices: each value in [0,100] placed along its axis at the
 * matching fraction of `r`. Out-of-range values are clamped.
 */
export function radarVertices(values: number[], r: number, cx: number, cy: number): Point[] {
  const n = values.length;
  return values.map((v, i) => {
    const rr = (clamp(v, 0, 100) / 100) * r;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
  });
}

export interface Segment {
  /** Center of the segment (where a rotated line View is anchored). */
  cx: number;
  cy: number;
  /** Euclidean length between the two points. */
  length: number;
  /** Rotation in degrees for a horizontal line View to align a→b. */
  angleDeg: number;
}

/**
 * Geometry for drawing the edge a→b as a single rotated line `View` (no SVG):
 * position a `length`-wide View at the segment midpoint, rotated `angleDeg`.
 */
export function segment(a: Point, b: Point): Segment {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    length: Math.hypot(dx, dy),
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** Consecutive edges of a closed polygon through `points` (wraps last→first). */
export function polygonEdges(points: Point[]): Segment[] {
  return points.map((p, i) => segment(p, points[(i + 1) % points.length]));
}

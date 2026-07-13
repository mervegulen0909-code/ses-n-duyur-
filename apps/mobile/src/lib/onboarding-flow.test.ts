import { describe, expect, it } from 'vitest';

import { CRITERIA } from '@voxscore/scoring';

import {
  DEMO_CRITERIA_SCORES,
  DEMO_SCORES_ORDERED,
  INTENTS,
  polarPoints,
  polygonEdges,
  radarVertices,
  routeForIntent,
  segment,
  type Point,
} from './onboarding-flow';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('routeForIntent', () => {
  it('maps each intent to its first-value route', () => {
    expect(routeForIntent('singer')).toBe('/add');
    expect(routeForIntent('juror')).toBe('/battle');
    expect(routeForIntent('explorer')).toBe('/');
  });

  it('covers exactly the three declared intents', () => {
    expect(INTENTS).toHaveLength(3);
    for (const id of INTENTS) expect(typeof routeForIntent(id)).toBe('string');
  });
});

describe('demo radar data', () => {
  it('has a score for every one of the 9 criteria', () => {
    expect(Object.keys(DEMO_CRITERIA_SCORES).sort()).toEqual([...CRITERIA].sort());
    expect(DEMO_SCORES_ORDERED).toHaveLength(CRITERIA.length);
  });

  it('orders scores to match CRITERIA', () => {
    CRITERIA.forEach((c, i) => expect(DEMO_SCORES_ORDERED[i]).toBe(DEMO_CRITERIA_SCORES[c]));
  });

  it('keeps all demo values in range', () => {
    for (const v of DEMO_SCORES_ORDERED) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('polarPoints', () => {
  it('starts at 12 o’clock and goes clockwise', () => {
    const [top, right] = polarPoints(4, 10, 0, 0);
    expect(near(top.x, 0)).toBe(true);
    expect(near(top.y, -10)).toBe(true); // straight up (y grows downward)
    expect(near(right.x, 10)).toBe(true);
    expect(near(right.y, 0)).toBe(true); // next point is to the right → clockwise
  });

  it('returns `count` points all at radius r from the center', () => {
    const pts = polarPoints(9, 50, 100, 100);
    expect(pts).toHaveLength(9);
    for (const p of pts) expect(near(Math.hypot(p.x - 100, p.y - 100), 50, 1e-6)).toBe(true);
  });
});

describe('radarVertices', () => {
  it('places 100 at the full radius and 0 at the center', () => {
    const [full, , , zero] = radarVertices([100, 50, 50, 0], 20, 0, 0);
    expect(near(full.y, -20)).toBe(true); // top axis, full radius
    expect(near(zero.x, 0) && near(zero.y, 0)).toBe(true); // 4th axis at value 0 → center
  });

  it('clamps out-of-range values', () => {
    const [overshoot] = radarVertices([250], 10, 0, 0);
    expect(near(Math.hypot(overshoot.x, overshoot.y), 10, 1e-6)).toBe(true);
    const [undershoot] = radarVertices([-40], 10, 0, 0);
    expect(near(Math.hypot(undershoot.x, undershoot.y), 0, 1e-6)).toBe(true);
  });
});

describe('segment / polygonEdges', () => {
  it('computes length, midpoint and angle for an edge', () => {
    const s = segment({ x: 0, y: 0 }, { x: 6, y: 8 });
    expect(near(s.length, 10)).toBe(true);
    expect(near(s.cx, 3) && near(s.cy, 4)).toBe(true);
    expect(near(s.angleDeg, (Math.atan2(8, 6) * 180) / Math.PI)).toBe(true);
  });

  it('closes the polygon (wraps last→first)', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const edges = polygonEdges(square);
    expect(edges).toHaveLength(4);
    for (const e of edges) expect(near(e.length, 2)).toBe(true); // unit square, side 2
  });
});

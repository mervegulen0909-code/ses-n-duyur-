// Pure, deterministic art math for the VoxScore storyboard board.
//
// Split out from the JSX so the non-trivial bits — the cyan→coral color ramp
// and the seeded "listening orb" particle field — are unit-testable without a
// DOM. Recreated from the "VoxScore Storyboard" board exported from Claude
// Design (claude.ai/design); see ./voxscore-storyboard.tsx.

export const CYAN = '#3fd0ec';
export const CORAL = '#f0795f';

/** Linear-interpolate the cyan→coral ramp; `t` in [0, 1]. */
export function mix(t: number): string {
  const ch = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${ch(63, 240)},${ch(208, 121)},${ch(236, 95)})`;
}

/**
 * Heights for one equalizer bar row. `hfn` is the design's sine envelope,
 * evaluated over a normalized 0..1 ramp; every bar is floored at 3px so it
 * stays visible at the troughs.
 */
export function barHeights(n: number, hfn: (i: number, t: number) => number): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(3, hfn(i, n === 1 ? 0 : i / (n - 1))));
}

export type OrbDot = { cx: number; cy: number; r: number; fill: string; opacity: number };

/**
 * The onboarding screen's AI "listening" orb: concentric rings of particles at
 * fixed radii/counts, jittered by a seeded LCG so the field is identical on
 * every render (no server/client hydration drift). Matches the original board's
 * seed = 11 and its rnd() call order (jitter, radius, color, opacity) so the
 * particle layout is reproduced exactly.
 */
export function orbDots(): OrbDot[] {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const rings: [number, number][] = [
    [22, 9],
    [36, 13],
    [50, 16],
    [62, 18],
    [72, 16],
  ];
  const dots: OrbDot[] = [];
  rings.forEach(([radius, count], ri) => {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + ri * 0.5;
      const rr = radius + (rnd() - 0.5) * 7;
      dots.push({
        cx: 75 + Math.cos(ang) * rr,
        cy: 75 + Math.sin(ang) * rr,
        r: 0.7 + rnd() * 1.7,
        fill: rnd() > 0.82 ? CORAL : CYAN,
        opacity: 0.35 + rnd() * 0.55,
      });
    }
  });
  return dots;
}

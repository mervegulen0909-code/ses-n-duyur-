import { describe, expect, it } from 'vitest';
import { CORAL, CYAN, barHeights, mix, orbDots } from './voxscore-storyboard-art';

describe('voxscore storyboard art', () => {
  describe('mix', () => {
    it('returns the cyan→coral ramp endpoints exactly', () => {
      expect(mix(0)).toBe('rgb(63,208,236)');
      expect(mix(1)).toBe('rgb(240,121,95)');
    });

    it('rounds the channels at the ramp midpoint', () => {
      // R 63→240, G 208→121, B 236→95, each at t=0.5 then Math.round.
      expect(mix(0.5)).toBe('rgb(152,165,166)');
    });
  });

  describe('barHeights', () => {
    it('produces one height per bar and floors them at 3px', () => {
      expect(barHeights(5, () => -100)).toEqual([3, 3, 3, 3, 3]);
    });

    it('evaluates the envelope across a normalized 0..1 ramp', () => {
      const hs = barHeights(
        22,
        (i, t) => 3 + 16 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.9))),
      );
      expect(hs).toHaveLength(22);
      expect(hs[0]).toBe(3); // t = 0 → sin(0) = 0 → floored to 3
      hs.forEach((h) => expect(h).toBeGreaterThanOrEqual(3));
    });

    it('guards the single-bar case against divide-by-zero', () => {
      expect(barHeights(1, () => 50)).toEqual([50]);
    });
  });

  describe('orbDots', () => {
    it('is deterministic across renders (no hydration drift)', () => {
      expect(orbDots()).toEqual(orbDots());
    });

    it('builds the five-ring particle field', () => {
      expect(orbDots()).toHaveLength(9 + 13 + 16 + 18 + 16);
    });

    it('only paints cyan or coral, within the drawn bounds', () => {
      for (const d of orbDots()) {
        expect([CYAN, CORAL]).toContain(d.fill);
        expect(d.r).toBeGreaterThanOrEqual(0.7);
        expect(d.r).toBeLessThanOrEqual(2.4);
        expect(d.opacity).toBeGreaterThanOrEqual(0.35);
        expect(d.opacity).toBeLessThanOrEqual(0.9);
        // centered on (75,75); max radius 72 + half the 7px jitter
        expect(Math.hypot(d.cx - 75, d.cy - 75)).toBeLessThanOrEqual(76);
      }
    });
  });
});

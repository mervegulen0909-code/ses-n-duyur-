import { assertFinite } from './util';

/** z-score for a 95% confidence interval. */
export const Z_95 = 1.959963984540054;

/**
 * Wilson score lower bound for a binomial proportion.
 *
 * Used for leaderboard ranking: it penalizes items with few observations so a
 * "5 wins / 5 battles" performance ranks below a "480 wins / 500 battles" one.
 * Returns a value in [0, 1]. With `total === 0`, returns 0 (no evidence).
 */
export function wilsonLowerBound(positive: number, total: number, z: number = Z_95): number {
  assertFinite(positive, 'positive');
  assertFinite(total, 'total');
  assertFinite(z, 'z');
  if (positive < 0 || total < 0) throw new RangeError('positive/total must be >= 0');
  if (positive > total) throw new RangeError('positive must be <= total');
  if (total === 0) return 0;

  const n = total;
  const phat = positive / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return (center - margin) / denominator;
}

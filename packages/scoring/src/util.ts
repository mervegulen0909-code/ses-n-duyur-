/**
 * Shared numeric helpers for the scoring core.
 * Pure functions only — no side effects, no I/O.
 */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new RangeError('clamp: min must be <= max');
  return Math.min(Math.max(value, min), max);
}

/** Round to `decimals` decimal places (default 2), avoiding float drift. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Assert a finite number; throws with `label` context otherwise. */
export function assertFinite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number, got: ${String(value)}`);
  }
  return value;
}

/** Assert a value is a finite score within [0, 100]. */
export function assertScore(value: number, label: string): number {
  assertFinite(value, label);
  if (value < 0 || value > 100) {
    throw new RangeError(`${label} must be within [0, 100], got: ${value}`);
  }
  return value;
}

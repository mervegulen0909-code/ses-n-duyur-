/**
 * Listener streak: consecutive UTC days with ≥1 VALID verified listen.
 * A streak is alive if its last day is today or yesterday (grace until the
 * day actually ends). Pure — callers supply distinct 'YYYY-MM-DD' strings.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function computeStreak(utcDates: string[], today: string): number {
  const days = new Set(utcDates);
  const t = Date.parse(`${today}T00:00:00Z`);
  let cursor = days.has(today) ? t : t - DAY_MS;
  if (!days.has(new Date(cursor).toISOString().slice(0, 10))) return 0;
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export type StreakTier = 'none' | 'bronze' | 'silver' | 'gold';

export function streakTier(streak: number): StreakTier {
  if (streak >= 30) return 'gold';
  if (streak >= 7) return 'silver';
  if (streak >= 3) return 'bronze';
  return 'none';
}

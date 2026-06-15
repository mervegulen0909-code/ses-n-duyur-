import { trendDirection } from '@/lib/leaderboard';

/** Small ▲/▼ delta vs the AI start score; renders nothing when flat. */
export function TrendTag({ trend }: { trend: number | null }) {
  const dir = trendDirection(trend);
  if (dir === 'flat' || trend === null) return null;
  const up = dir === 'up';
  return (
    <span
      className={`hidden text-xs tabular-nums sm:inline ${up ? 'text-emerald-400' : 'text-rose-400'}`}
    >
      {up ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}
    </span>
  );
}

const MEDAL: Record<number, string> = {
  1: 'bg-amber-300 text-neutral-900',
  2: 'bg-neutral-300 text-neutral-900',
  3: 'bg-amber-700 text-amber-50',
};

/** Numbered rank with a medal pill for the top three. */
export function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL[rank];
  if (medal) {
    return (
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${medal}`}
      >
        {rank}
      </span>
    );
  }
  return <span className="w-6 shrink-0 text-right tabular-nums text-neutral-500">{rank}</span>;
}

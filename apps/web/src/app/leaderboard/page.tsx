import Link from 'next/link';
import { wilsonLowerBound } from '@vocal-league/scoring';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  title: string;
  currentScore: number | null;
  trendScore: number | null;
  isProvisional: boolean;
  wins: number;
  battles: number;
  wilson: number;
}

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? 'Untitled performance';
}

export default async function LeaderboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-400">
        Supabase is not configured yet.
      </main>
    );
  }

  const { data: perfs } = await supabase
    .from('performances')
    .select('id, oembed_meta, battle_wins, battle_count')
    .eq('status', 'active');

  const { data: scores } = await supabase
    .from('scores')
    .select('performance_id, current_score, trend_score, is_provisional');

  const scoreByPerf = new Map((scores ?? []).map((s) => [s.performance_id, s]));

  const rows: Row[] = (perfs ?? [])
    .map((p) => {
      const s = scoreByPerf.get(p.id);
      return {
        id: p.id,
        title: titleOf(p.oembed_meta),
        currentScore: s?.current_score ?? null,
        trendScore: s?.trend_score ?? null,
        isProvisional: s?.is_provisional ?? true,
        wins: p.battle_wins,
        battles: p.battle_count,
        wilson: wilsonLowerBound(p.battle_wins, p.battle_count),
      };
    })
    .sort((a, b) => b.wilson - a.wilson || (b.currentScore ?? 0) - (a.currentScore ?? 0));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <RealtimeRefresh table="scores" />
      <h1 className="mb-6 text-2xl font-bold">Leaderboard</h1>

      {rows.length === 0 ? (
        <p className="text-neutral-400">No performances yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link
                href={`/performance/${r.id}`}
                className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600"
              >
                <span className="w-6 text-right tabular-nums text-neutral-500">{i + 1}</span>
                <span className="flex-1 truncate text-sm">{r.title}</span>
                {r.isProvisional && <ProvisionalBadge />}
                <span className="hidden text-xs text-neutral-500 sm:inline">
                  {r.wins}-{r.battles - r.wins} · Elo·battle
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">
                  {r.currentScore === null ? '—' : r.currentScore.toFixed(1)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

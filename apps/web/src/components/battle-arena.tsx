'use client';

import { useEffect, useState } from 'react';
import { useVerifiedListen, type ListenStatus } from '@/lib/use-verified-listen';
import { YouTubePlayer } from './youtube-player';

interface Side {
  performanceId: string;
  videoId: string;
  title: string;
}
interface Battle {
  battleId: string;
  a: Side;
  b: Side;
}

function statusLabel(status: ListenStatus): string {
  if (status === 'verified') return '✓ Listened';
  if (status === 'invalid') return 'Not fully listened';
  if (status === 'listening') return 'Listening…';
  return 'Press play & watch fully';
}

function BattleSide({
  side,
  listen,
}: {
  side: Side;
  listen: ReturnType<typeof useVerifiedListen>;
}) {
  return (
    <div className="space-y-2">
      <h2 className="truncate text-sm font-semibold">{side.title}</h2>
      <YouTubePlayer
        videoId={side.videoId}
        onStart={listen.onStart}
        onComplete={listen.onComplete}
      />
      <p
        className={`text-xs ${
          listen.status === 'verified'
            ? 'text-emerald-400'
            : listen.status === 'invalid'
              ? 'text-rose-400'
              : 'text-neutral-500'
        }`}
      >
        {statusLabel(listen.status)}
      </p>
    </div>
  );
}

function BattleInner({ battle, onDone }: { battle: Battle; onDone: () => void }) {
  const listenA = useVerifiedListen(battle.a.performanceId);
  const listenB = useVerifiedListen(battle.b.performanceId);
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const bothVerified = listenA.status === 'verified' && listenB.status === 'verified';

  async function vote(winnerPerformanceId: string) {
    if (!bothVerified || !listenA.listenIdRef.current || !listenB.listenIdRef.current) return;
    setBusy(true);
    try {
      const res = await fetch('/api/battles/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          battleId: battle.battleId,
          winnerPerformanceId,
          listenAId: listenA.listenIdRef.current,
          listenBId: listenB.listenIdRef.current,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      setResult(res.ok && body.ok ? 'Vote recorded! 🎉' : (body.error ?? 'Failed'));
    } catch {
      setResult('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <BattleSide side={battle.a} listen={listenA} />
        <BattleSide side={battle.b} listen={listenB} />
      </div>

      {result ? (
        <div className="space-y-3 text-center">
          <p className="text-emerald-400">{result}</p>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
          >
            Next battle →
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!bothVerified || busy}
            onClick={() => vote(battle.a.performanceId)}
            className="rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {battle.a.title} wins
          </button>
          <button
            type="button"
            disabled={!bothVerified || busy}
            onClick={() => vote(battle.b.performanceId)}
            className="rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {battle.b.title} wins
          </button>
        </div>
      )}
      {!bothVerified && !result && (
        <p className="text-center text-xs text-neutral-600">
          You must fully listen to BOTH performances before choosing a winner.
        </p>
      )}
    </div>
  );
}

export function BattleArena() {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setBattle(null);
    (async () => {
      try {
        const res = await fetch('/api/battles/next', { method: 'POST' });
        if (res.status === 404) {
          if (!cancelled) setState('empty');
          return;
        }
        const body = (await res.json()) as Battle & { error?: string };
        if (!cancelled) {
          if (res.ok && body.battleId && body.a.videoId && body.b.videoId) {
            setBattle(body);
            setState('ready');
          } else {
            setState('error');
          }
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (state === 'loading') return <p className="text-neutral-400">Finding a battle…</p>;
  if (state === 'empty')
    return <p className="text-neutral-400">Not enough performances to battle yet. Add more!</p>;
  if (state === 'error' || !battle)
    return <p className="text-rose-400">Could not load a battle.</p>;

  return (
    <BattleInner key={battle.battleId} battle={battle} onDone={() => setNonce((n) => n + 1)} />
  );
}

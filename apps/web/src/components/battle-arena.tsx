'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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

function statusKey(status: ListenStatus): string {
  if (status === 'verified') return 'statusListened';
  if (status === 'invalid') return 'statusNotFully';
  if (status === 'listening') return 'statusListening';
  return 'statusPressPlay';
}

function BattleSide({
  side,
  listen,
}: {
  side: Side;
  listen: ReturnType<typeof useVerifiedListen>;
}) {
  const t = useTranslations('Battle');
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
        {t(statusKey(listen.status))}
      </p>
    </div>
  );
}

function BattleInner({ battle, onDone }: { battle: Battle; onDone: () => void }) {
  const t = useTranslations();
  const listenA = useVerifiedListen(battle.a.performanceId);
  const listenB = useVerifiedListen(battle.b.performanceId);
  const [result, setResult] = useState<string>('');
  // Only a confirmed success ('ok') swaps in the 'Next battle' block; an error
  // keeps the winner buttons so a transient failure can be retried in-place.
  const [voteState, setVoteState] = useState<'ok' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const bothVerified = listenA.status === 'verified' && listenB.status === 'verified';

  async function vote(winnerPerformanceId: string) {
    if (!bothVerified || !listenA.listenIdRef.current || !listenB.listenIdRef.current) return;
    setBusy(true);
    setVoteState(null);
    setResult('');
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
      if (res.ok && body.ok) {
        setResult(t('Battle.voteRecorded'));
        setVoteState('ok');
      } else {
        setResult(body.error ?? t('Common.failed'));
        setVoteState('error');
      }
    } catch {
      setResult(t('Common.networkError'));
      setVoteState('error');
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

      {voteState === 'ok' ? (
        <div className="space-y-3 text-center">
          <p className="text-emerald-400">{result}</p>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
          >
            {t('Battle.nextBattle')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!bothVerified || busy}
              onClick={() => vote(battle.a.performanceId)}
              className="rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              {t('Battle.sideWins', { title: battle.a.title })}
            </button>
            <button
              type="button"
              disabled={!bothVerified || busy}
              onClick={() => vote(battle.b.performanceId)}
              className="rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              {t('Battle.sideWins', { title: battle.b.title })}
            </button>
          </div>
          {voteState === 'error' && <p className="text-center text-sm text-rose-400">{result}</p>}
        </div>
      )}
      {!bothVerified && voteState !== 'ok' && (
        <p className="text-center text-xs text-neutral-600">{t('Battle.mustListenBoth')}</p>
      )}
    </div>
  );
}

export function BattleArena() {
  const t = useTranslations('Battle');
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

  if (state === 'loading') return <p className="text-neutral-400">{t('finding')}</p>;
  if (state === 'empty') return <p className="text-neutral-400">{t('notEnough')}</p>;
  if (state === 'error' || !battle) return <p className="text-rose-400">{t('couldNotLoad')}</p>;

  return (
    <BattleInner key={battle.battleId} battle={battle} onDone={() => setNonce((n) => n + 1)} />
  );
}

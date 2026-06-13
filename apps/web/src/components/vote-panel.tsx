'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CRITERIA, type Criterion } from '@vocal-league/scoring';
import type { ListenEvent } from '@vocal-league/core';
import { YouTubePlayer } from './youtube-player';
import { TurnstileWidget } from './turnstile-widget';

type ListenStatus = 'idle' | 'listening' | 'verified' | 'invalid';

export function VotePanel({
  performanceId,
  videoId,
  hasVideo,
}: {
  performanceId: string;
  videoId: string;
  hasVideo: boolean;
}) {
  const router = useRouter();
  const t = useTranslations();
  const listenIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ListenStatus>('idle');
  const [hint, setHint] = useState(() => t('Vote.hintIdle'));

  const activeCriteria = CRITERIA.filter((c) => hasVideo || c !== 'stagePresence');
  const [ratings, setRatings] = useState<Record<Criterion, number>>(
    () => Object.fromEntries(CRITERIA.map((c) => [c, 50])) as Record<Criterion, number>,
  );
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [submitMsg, setSubmitMsg] = useState('');
  const [token, setToken] = useState<string | null>(null);

  const onStart = useCallback(async () => {
    if (listenIdRef.current) return;
    setStatus('listening');
    try {
      const res = await fetch('/api/listens/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ performanceId }),
      });
      const body = (await res.json()) as { listenId?: string };
      if (body.listenId) listenIdRef.current = body.listenId;
    } catch {
      setHint(t('Vote.errStart'));
    }
  }, [performanceId, t]);

  const onComplete = useCallback(
    async (events: ListenEvent[], durationS: number) => {
      if (!listenIdRef.current) return;
      setHint(t('Vote.verifying'));
      try {
        const res = await fetch('/api/listens/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            performanceId,
            listenId: listenIdRef.current,
            durationS,
            events,
          }),
        });
        const body = (await res.json()) as { isValid?: boolean; reason?: string | null };
        if (body.isValid) {
          setStatus('verified');
          setHint(t('Vote.verified'));
        } else {
          setStatus('invalid');
          setHint(body.reason ?? t('Vote.notVerified'));
        }
      } catch {
        setStatus('invalid');
        setHint(t('Vote.errVerify'));
      }
    },
    [performanceId, t],
  );

  async function submitVote() {
    if (!listenIdRef.current) return;
    setSubmitState('submitting');
    setSubmitMsg('');
    const activeRatings = Object.fromEntries(activeCriteria.map((c) => [c, ratings[c]]));
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-turnstile-token': token } : {}),
        },
        body: JSON.stringify({
          performanceId,
          verifiedListenId: listenIdRef.current,
          ratings: activeRatings,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; currentScore?: number; error?: string };
      if (!res.ok || !body.ok) {
        setSubmitState('error');
        setSubmitMsg(body.error ?? t('Common.failedStatus', { status: res.status }));
        return;
      }
      setSubmitState('done');
      setSubmitMsg(
        body.currentScore !== undefined
          ? t('Vote.thanksScore', { score: body.currentScore.toFixed(1) })
          : t('Vote.thanks'),
      );
      router.refresh();
    } catch {
      setSubmitState('error');
      setSubmitMsg(t('Common.networkError'));
    }
  }

  return (
    <div className="space-y-4">
      <YouTubePlayer videoId={videoId} onStart={onStart} onComplete={onComplete} />

      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          status === 'verified'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : status === 'invalid'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              : 'border-neutral-700 bg-neutral-900 text-neutral-400'
        }`}
      >
        {hint}
      </div>

      {status === 'verified' && submitState !== 'done' && (
        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <h3 className="text-sm font-semibold">{t('Vote.rateThis')}</h3>
          {activeCriteria.map((c) => (
            <label key={c} className="block text-sm">
              <span className="flex justify-between text-neutral-400">
                <span>{t(`Criteria.${c}`)}</span>
                <span className="tabular-nums text-neutral-300">{ratings[c]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={ratings[c]}
                onChange={(e) => setRatings((r) => ({ ...r, [c]: Number(e.target.value) }))}
                className="w-full accent-emerald-500"
              />
            </label>
          ))}
          <TurnstileWidget onToken={setToken} />
          <button
            type="button"
            onClick={submitVote}
            disabled={submitState === 'submitting'}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitState === 'submitting' ? t('Vote.submitting') : t('Vote.submit')}
          </button>
          {submitState === 'error' && <p className="text-sm text-rose-400">{submitMsg}</p>}
        </div>
      )}

      {submitState === 'done' && <p className="text-sm text-emerald-400">{submitMsg}</p>}
    </div>
  );
}

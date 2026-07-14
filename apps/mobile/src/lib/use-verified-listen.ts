import type { ListenEvent } from '@voxscore/core';
import { useCallback, useRef, useState } from 'react';

import { completeListen, startListen } from './api';

export type ListenStatus = 'idle' | 'listening' | 'verified' | 'invalid';

/** Map a failed startListen to an actionable message (status surfaced for support). */
function startFailureReason(status: number, error?: string): string {
  if (status === 401) return 'Sign in again to listen and vote (session expired).';
  if (status === 429) return 'Too many listening sessions — finish one, then replay.';
  if (status === 0) return 'Could not reach the server — check your connection and replay.';
  return `Could not start the listen (HTTP ${status})${error ? ` — ${error}` : ''}. Replay to retry.`;
}

/**
 * Drives a Verified Listen for one performance (native): opens a session on
 * first play, submits the watch-event trail on completion, tracks verified
 * status. Mirrors the web hook; the server runs the same anti-cheat.
 */
export function useVerifiedListen(performanceId: string) {
  const listenIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ListenStatus>('idle');
  const [reason, setReason] = useState<string | null>(null);

  const onStart = useCallback(async () => {
    if (listenIdRef.current) return;
    setStatus('listening');
    setReason(null);
    // If the session can't be opened (offline / expired session / rate-limit),
    // surface an actionable error instead of silently reverting to 'idle' — a
    // full watch afterward would otherwise dead-end with no way to unlock voting.
    try {
      const res = await startListen(performanceId);
      if (res.listenId) {
        listenIdRef.current = res.listenId;
      } else {
        setStatus('invalid');
        setReason(startFailureReason(res.status, res.error));
      }
    } catch {
      setStatus('invalid');
      setReason(startFailureReason(0));
    }
  }, [performanceId]);

  const onComplete = useCallback(
    async (events: ListenEvent[], durationS: number) => {
      if (!listenIdRef.current) return;
      const res = await completeListen(performanceId, listenIdRef.current, durationS, events);
      if (res.isValid) {
        setStatus('verified');
      } else {
        setStatus('invalid');
        setReason(res.reason ?? null);
      }
    },
    [performanceId],
  );

  return { status, reason, listenId: listenIdRef, onStart, onComplete };
}

import type { ListenEvent } from '@vocal-league/core';
import { useCallback, useRef, useState } from 'react';

import { completeListen, startListen } from './api';

export type ListenStatus = 'idle' | 'listening' | 'verified' | 'invalid';

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
    const id = await startListen(performanceId);
    if (id) listenIdRef.current = id;
    else setStatus('idle');
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

'use client';

import { useCallback, useRef, useState } from 'react';
import type { ListenEvent } from '@vocal-league/core';

export type ListenStatus = 'idle' | 'listening' | 'verified' | 'invalid';

/**
 * Drives a Verified Listen for one performance: opens a session on first play,
 * submits the watch-event trail on completion, and tracks the verified status.
 * Reused by the single-performance vote panel and both sides of a battle.
 */
export function useVerifiedListen(performanceId: string) {
  const listenIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ListenStatus>('idle');

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
      setStatus('idle');
    }
  }, [performanceId]);

  const onComplete = useCallback(
    async (events: ListenEvent[], durationS: number) => {
      if (!listenIdRef.current) return;
      try {
        const res = await fetch('/api/listens/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ performanceId, listenId: listenIdRef.current, durationS, events }),
        });
        const body = (await res.json()) as { isValid?: boolean };
        setStatus(body.isValid ? 'verified' : 'invalid');
      } catch {
        setStatus('invalid');
      }
    },
    [performanceId],
  );

  return { status, listenIdRef, onStart, onComplete };
}

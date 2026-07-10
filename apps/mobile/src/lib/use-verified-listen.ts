import type { ListenEvent } from '@voxscore/core';
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
    setReason(null);
    // If the session can't be opened (offline / expired session / rate-limit),
    // surface an actionable error instead of silently reverting to 'idle' — a
    // full watch afterward would otherwise dead-end with no way to unlock voting.
    try {
      const id = await startListen(performanceId);
      if (id) {
        listenIdRef.current = id;
      } else {
        setStatus('invalid');
        setReason('Could not start the listen — check your connection and replay.');
      }
    } catch {
      setStatus('invalid');
      setReason('Could not start the listen — check your connection and replay.');
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

'use client';

import { useEffect, useRef } from 'react';
import type { ListenEvent } from '@vocal-league/core';

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
}
interface YTStateEvent {
  data: number;
  target: YTPlayer;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: { onStateChange?: (e: YTStateEvent) => void };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

function ensureApi(cb: () => void) {
  if (window.YT?.Player) {
    cb();
    return;
  }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    cb();
  };
  if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    document.head.appendChild(s);
  }
}

/**
 * YouTube IFrame Player that records a watch-progress event trail used by the
 * server to grant a Verified Listen. We embed only — no download.
 */
export function YouTubePlayer({
  videoId,
  onStart,
  onComplete,
}: {
  videoId: string;
  onStart?: () => void;
  onComplete?: (events: ListenEvent[], durationS: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<ListenEvent[]>([]);
  const startedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stopPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const record = (kind: ListenEvent['kind'], p: YTPlayer) => {
      eventsRef.current.push({
        kind,
        atSeconds: Math.floor(p.getCurrentTime()),
        clientTs: Date.now(),
      });
    };

    ensureApi(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      const YT = window.YT;
      new YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              if (!startedRef.current) {
                startedRef.current = true;
                onStart?.();
              }
              record('playing', e.target);
              stopPoll();
              pollRef.current = setInterval(() => record('playing', e.target), 3000);
            } else if (e.data === YT.PlayerState.PAUSED) {
              stopPoll();
              record('paused', e.target);
            } else if (e.data === YT.PlayerState.ENDED) {
              stopPoll();
              record('ended', e.target);
              onComplete?.([...eventsRef.current], Math.floor(e.target.getDuration()));
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopPoll();
    };
  }, [videoId, onStart, onComplete]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-neutral-800 bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

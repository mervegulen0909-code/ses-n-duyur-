'use client';

import type { AnalyticsEvent } from '@voxscore/core';

const SESSION_KEY = 'vs_session_id';

/**
 * A client-generated random UUID, NOT a tracking cookie — lazily created and
 * cached in localStorage so events from the same browser share one session id
 * across page loads. Falls back to a fresh one per call if storage is
 * unavailable (private browsing, SSR).
 */
function sessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Fire-and-forget product analytics. Never throws, never blocks the caller —
 * a dropped event must not break the feature that fired it. Uses
 * `navigator.sendBeacon` when available (survives page navigation), else a
 * best-effort `fetch`.
 */
export function track(event: AnalyticsEvent, meta?: Record<string, string | number>): void {
  try {
    const body = JSON.stringify({ event, sessionId: sessionId(), meta });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics', blob);
      return;
    }
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the feature that fired it.
  }
}

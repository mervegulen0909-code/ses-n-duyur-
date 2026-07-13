'use client';

import { useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { TurnstileWidget } from '@/components/turnstile-widget';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/** Hosted on VoxScore's allowed hostname and loaded only inside native WebView. */
export default function MobileTurnstilePage() {
  const t = useTranslations('MobileTurnstile');
  const configured = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const post = useCallback((payload: Record<string, unknown>) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    if (!configured) post({ disabled: true });
  }, [configured, post]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-neutral-950 px-6 text-center">
      <div className="max-w-sm">
        <p className="mb-4 text-sm text-neutral-400">{t('verifying')}</p>
        <TurnstileWidget onToken={(token) => token && post({ token })} />
      </div>
    </div>
  );
}

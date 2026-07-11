'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import { SITE_URL } from '@/lib/site';

export interface ShareButtonsProps {
  /** Site-relative path, e.g. `/performance/{id}`. */
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const t = useTranslations('Performance');
  const [copied, setCopied] = useState(false);
  // Avoid an SSR/client hydration mismatch: `navigator.share` only exists in
  // the browser, so the native-share button is added post-mount, not on the
  // first (server-matching) render.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator);
  }, []);
  const absoluteUrl = `${SITE_URL}${url}`;

  function fire(channel: string) {
    track('share_clicked', { channel });
  }

  async function copyLink() {
    fire('copy');
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the link is still visible/selectable.
    }
  }

  async function nativeShare() {
    if (!navigator.share) return;
    fire('native');
    try {
      await navigator.share({ title, url: absoluteUrl });
    } catch {
      // User cancelled the native share sheet — not an error.
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${title} — ${absoluteUrl}`)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(absoluteUrl)}`;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-neutral-300">{t('shareHeading')}</h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500"
        >
          {copied ? t('linkCopied') : t('copyLink')}
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          onClick={() => fire('whatsapp')}
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500"
        >
          {t('shareWhatsapp')}
        </a>
        <a
          href={xHref}
          target="_blank"
          rel="noreferrer"
          onClick={() => fire('x')}
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500"
        >
          {t('shareX')}
        </a>
        {canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500"
          >
            {t('shareHeading')}
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';

export function ShareKitActions({ caption, imageHref }: { caption: string; imageHref: string }) {
  const t = useTranslations('ShareKit');
  const [copied, setCopied] = useState(false);

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      track('share_clicked', { context: 'ugc_share_kit', channel: 'copy_caption' });
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-200">{caption}</p>
        <button
          type="button"
          onClick={() => void copyCaption()}
          className="mt-4 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold hover:border-emerald-500 hover:text-emerald-300"
        >
          {copied ? t('copied') : t('copyCaption')}
        </button>
      </div>
      <a
        download="voxscore-story-card.png"
        href={imageHref}
        onClick={() =>
          track('share_clicked', { context: 'ugc_share_kit', channel: 'card_download' })
        }
        className="inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-bold text-emerald-950 hover:bg-emerald-300"
      >
        {t('downloadCard')}
      </a>
    </div>
  );
}

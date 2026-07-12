'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { buildShareLine, scoreBar } from '@voxscore/core';
import { track } from '@/lib/analytics';

/**
 * The share moment: shown immediately after a result (score reveal, battle
 * vote). Renders a one-tap copy of the Wordle-style text artifact plus
 * WhatsApp/X intents carrying the same text. Fires share_rendered once on
 * mount and share_clicked per channel — the two ends of the k-factor funnel.
 */
export function ResultShare({
  headline,
  score,
  url,
  context,
}: {
  headline: string;
  score: number | null;
  url: string;
  context: string; // e.g. 'battle_result' | 'performance_score' — analytics meta only
}) {
  const t = useTranslations('Common');
  const [copied, setCopied] = useState(false);
  const line = buildShareLine({
    headline,
    bar: score === null ? undefined : scoreBar(score),
    url,
  });

  useEffect(() => {
    track('share_rendered', { context });
  }, [context]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      track('share_clicked', { context, channel: 'copy_line' });
    } catch {
      // Clipboard can be unavailable (permissions); the intents still work.
    }
  }

  const encoded = encodeURIComponent(line);
  const btn =
    'rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500';

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={onCopy} className={btn}>
        {copied ? t('resultCopied') : t('copyResultLine')}
      </button>
      <a
        href={`https://wa.me/?text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className={btn}
        onClick={() => track('share_clicked', { context, channel: 'whatsapp' })}
      >
        {t('shareOnWhatsApp')}
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className={btn}
        onClick={() => track('share_clicked', { context, channel: 'x' })}
      >
        {t('shareOnX')}
      </a>
    </div>
  );
}

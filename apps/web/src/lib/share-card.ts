/**
 * View-model for the shareable score card (story-format image). Pure — the
 * image route feeds it raw Supabase rows; fallbacks here keep the card
 * rendering even for a performance with no score yet.
 */

export interface ShareCardData {
  title: string;
  authorName: string | null;
  scoreLabel: string;
  isProvisional: boolean;
}

interface OEmbedish {
  title?: string;
  authorName?: string;
}

export function buildShareCardData(
  perf: { oembed_meta: unknown } | null,
  score: { current_score: number | null; is_provisional: boolean } | null,
): ShareCardData {
  const meta = (perf?.oembed_meta ?? {}) as OEmbedish;
  return {
    title: meta.title ?? 'VoxScore performance',
    authorName: meta.authorName ?? null,
    scoreLabel:
      score?.current_score !== null && score?.current_score !== undefined
        ? score.current_score.toFixed(1)
        : '—',
    // A missing score row is treated as provisional — never imply a real
    // measurement that doesn't exist (hard rule 2).
    isProvisional: score?.is_provisional ?? true,
  };
}

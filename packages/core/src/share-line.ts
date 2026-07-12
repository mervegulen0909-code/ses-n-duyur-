/**
 * The copy-paste share artifact (Wordle pattern): a short, spoiler-free,
 * platform-agnostic text block a user pastes anywhere. The headline is
 * caller-localized; this module owns only the stable FORMAT so every
 * surface (web result, battle, challenge, mobile) emits the same shape.
 */

/** 0–100 score → five-block emoji bar, rounded to the nearest block. */
export function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return '🟩'.repeat(filled) + '⬛'.repeat(5 - filled);
}

export interface ShareLine {
  /** Localized first line, e.g. "🎤 VoxScore 71.6 — Bohemian Rhapsody". */
  headline: string;
  /** Optional scoreBar() output. */
  bar?: string;
  /** Absolute URL back into the product — the invite. */
  url: string;
}

export function buildShareLine(line: ShareLine): string {
  return [line.headline, line.bar, line.url].filter(Boolean).join('\n');
}

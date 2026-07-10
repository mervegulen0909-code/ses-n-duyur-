/**
 * Song identity — the backbone of same-song matchmaking ("who sings THIS song
 * best"). A performance's video title is messy free text; we resolve it to a
 * canonical song row via a normalized key so covers of the same song land on
 * the same song_id and can battle each other.
 */

/** Noise commonly appended to cover titles that must not split song identity. */
const NOISE_WORDS =
  /\b(official|video|music|audio|lyrics?|lyric|cover|live|acoustic|remaster(?:ed)?|hd|4k|mv|m\/v|performance|version|session|karaoke)\b/gu;

function clean(s: string): string {
  return (
    s
      .toLowerCase()
      // Drop bracketed qualifiers: "(Official Video)", "[4K Remaster]", "(cover)".
      .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
      // Strip diacritics (é→e, ş→s) so spelling variants collide.
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(NOISE_WORDS, ' ')
      // Anything that isn't a letter/number (any script) becomes a space.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  );
}

/**
 * Canonical matchmaking key for a song. Same (artist, title) in any casing,
 * punctuation, or "(Official Video)"-style decoration → same key.
 * Returns null when there's nothing usable to key on.
 */
export function normalizeSongKey(
  artist: string | null | undefined,
  title: string | null | undefined,
): string | null {
  const t = clean(title ?? '');
  if (!t) return null;
  const a = clean(artist ?? '');
  return a ? `${a} :: ${t}` : t;
}

export interface SongGuess {
  readonly title: string;
  readonly artist: string | null;
}

/**
 * Heuristic song guess from a raw VIDEO title — the dev/fallback path (the
 * production path asks the LLM, which handles arbitrary phrasings). Covers the
 * two dominant patterns: "Artist - Song ..." and "Song - Artist (cover...)".
 * Deterministic; returns null when the title has no recognizable split.
 */
export function parseSongFromTitle(videoTitle: string): SongGuess | null {
  // Strip bracketed qualifiers first so " - " inside them can't mislead.
  const bare = videoTitle.replace(/\(.*?\)|\[.*?\]/g, ' ').trim();
  const parts = bare.split(/\s+[-–—|]\s+/).filter((p) => p.trim().length > 0);
  if (parts.length < 2) return null;
  // Convention: "Artist - Song" is by far the most common YouTube pattern.
  const artist = parts[0]!.trim();
  const title = parts.slice(1).join(' ').trim();
  if (!title) return null;
  return { title, artist: artist || null };
}

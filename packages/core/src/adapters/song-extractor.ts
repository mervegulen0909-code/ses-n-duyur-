import { parseSongFromTitle, type SongGuess } from '../song';

/** Input to a song extractor: the public video metadata (never audio). */
export interface SongExtractInput {
  readonly title: string;
  readonly authorName: string;
}

/**
 * SongExtractor — resolves which SONG a performance video is of, from its
 * public metadata, so covers of the same song share a song_id and can battle
 * head-to-head. This is deliberately a SEPARATE adapter from ScoringProvider:
 * folding it into the scoring prompt would change scoring outputs and break
 * the deterministic-scoring contract (scoring_version 2).
 */
export interface SongExtractor {
  extract(input: SongExtractInput): Promise<SongGuess | null>;
}

/**
 * MockSongExtractor — deterministic heuristic used in dev and as the
 * production fallback: covers the dominant "Artist - Song" title pattern and
 * returns null (no song link) for anything ambiguous. Never guesses wildly —
 * a wrong song link is worse for matchmaking than none.
 */
export class MockSongExtractor implements SongExtractor {
  async extract(input: SongExtractInput): Promise<SongGuess | null> {
    return parseSongFromTitle(input.title);
  }
}

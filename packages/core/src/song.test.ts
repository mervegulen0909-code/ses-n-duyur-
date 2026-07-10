import { describe, expect, it } from 'vitest';
import { normalizeSongKey, parseSongFromTitle } from './song';

describe('normalizeSongKey — same song, same key', () => {
  it('is case/punctuation-insensitive', () => {
    expect(normalizeSongKey('Adele', 'Hello!')).toBe(normalizeSongKey('ADELE', 'hello'));
  });

  it('ignores bracketed qualifiers and noise words', () => {
    expect(normalizeSongKey('Adele', 'Hello (Official Music Video)')).toBe(
      normalizeSongKey('Adele', 'Hello'),
    );
    expect(normalizeSongKey('Queen', 'Bohemian Rhapsody [4K Remastered] Live')).toBe(
      normalizeSongKey('Queen', 'Bohemian Rhapsody'),
    );
  });

  it('strips diacritics so spelling variants collide', () => {
    expect(normalizeSongKey('Beyoncé', 'Café')).toBe(normalizeSongKey('Beyonce', 'Cafe'));
    expect(normalizeSongKey('Sezen Aksu', 'Gülümse')).toBe(
      normalizeSongKey('Sezen Aksu', 'Gulumse'),
    );
  });

  it('keys on title alone when the artist is unknown', () => {
    expect(normalizeSongKey(null, 'Hello')).toBe('hello');
    expect(normalizeSongKey('', 'Hello')).toBe('hello');
  });

  it('differs across artists (same title is NOT the same song)', () => {
    expect(normalizeSongKey('Adele', 'Hello')).not.toBe(normalizeSongKey('Lionel Richie', 'Hello'));
  });

  it('returns null when there is nothing usable', () => {
    expect(normalizeSongKey('Someone', '')).toBeNull();
    expect(normalizeSongKey(null, '(Official Video)')).toBeNull();
  });
});

describe('parseSongFromTitle — deterministic dev/fallback guess', () => {
  it('parses the dominant "Artist - Song" pattern', () => {
    expect(parseSongFromTitle('Adele - Hello (Official Music Video)')).toEqual({
      title: 'Hello',
      artist: 'Adele',
    });
  });

  it('handles en/em dashes and pipes', () => {
    expect(parseSongFromTitle('Queen – Bohemian Rhapsody')).toEqual({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
    });
    expect(parseSongFromTitle('Rick Astley | Never Gonna Give You Up')).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
    });
  });

  it('ignores separators hidden inside brackets', () => {
    expect(parseSongFromTitle('Hello (cover - acoustic)')).toBeNull();
  });

  it('returns null when there is no recognizable split', () => {
    expect(parseSongFromTitle('My first cover!!')).toBeNull();
  });
});

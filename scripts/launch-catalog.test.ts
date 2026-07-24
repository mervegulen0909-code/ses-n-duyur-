import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SONG_CATEGORIES,
  SONG_DIFFICULTIES,
  type SongCategory,
  type SongDifficulty,
} from '@voxscore/core';

interface TemplatePerformance {
  youtubeUrl: string | null;
  note: string;
}
interface TemplateSong {
  title: string;
  artist: string;
  category: SongCategory;
  difficulty: SongDifficulty;
  performances: TemplatePerformance[];
}

const TEMPLATE_PATH = fileURLToPath(
  new URL('../supabase/seed/launch-catalog.template.json', import.meta.url),
);

function load(): TemplateSong[] {
  return JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')) as TemplateSong[];
}

describe('launch-catalog.template.json', () => {
  // The catalog is a living library, not a fixed pilot set (docs/catalog-curation.md:
  // "38 pilot -> 1000+") — pin a floor, not an exact count, so growth doesn't break CI.
  it('has at least 500 songs', () => {
    expect(load().length).toBeGreaterThanOrEqual(500);
  });

  it('gives every song at least 1 performance slot (1000+ total)', () => {
    const songs = load();
    for (const song of songs) {
      expect(song.performances.length).toBeGreaterThanOrEqual(1);
    }
    const total = songs.reduce((sum, s) => sum + s.performances.length, 0);
    expect(total).toBeGreaterThanOrEqual(1000);
  });

  it('uses only valid categories and difficulties', () => {
    for (const song of load()) {
      expect(SONG_CATEGORIES).toContain(song.category);
      expect(SONG_DIFFICULTIES).toContain(song.difficulty);
    }
  });

  it('has a title and artist for every song', () => {
    for (const song of load()) {
      expect(song.title.trim().length).toBeGreaterThan(0);
      expect(song.artist.trim().length).toBeGreaterThan(0);
    }
  });

  it('every performance slot has a non-empty note and a youtubeUrl placeholder (null until filled)', () => {
    for (const song of load()) {
      for (const perf of song.performances) {
        expect(perf.note.trim().length).toBeGreaterThan(0);
        expect(perf.youtubeUrl === null || typeof perf.youtubeUrl === 'string').toBe(true);
      }
    }
  });

  it('balances category counts — every category used at least twice', () => {
    const songs = load();
    const counts = new Map<SongCategory, number>();
    for (const song of songs) counts.set(song.category, (counts.get(song.category) ?? 0) + 1);
    for (const category of SONG_CATEGORIES) {
      expect(counts.get(category) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('spreads difficulty — every level used at least 5 times', () => {
    const songs = load();
    const counts = new Map<SongDifficulty, number>();
    for (const song of songs) counts.set(song.difficulty, (counts.get(song.difficulty) ?? 0) + 1);
    for (const level of SONG_DIFFICULTIES) {
      expect(counts.get(level) ?? 0).toBeGreaterThanOrEqual(5);
    }
  });

  it('has no duplicate (title, artist) pairs', () => {
    const songs = load();
    const keys = songs.map((s) => `${s.title.toLowerCase()}::${s.artist.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

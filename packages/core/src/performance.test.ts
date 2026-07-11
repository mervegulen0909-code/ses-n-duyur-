import { describe, expect, it } from 'vitest';
import { CRITERIA } from '@voxscore/scoring';
import { buildPerformanceCreate } from './performance';
import type { OEmbedMetadata } from './youtube';
import type { ScoringResult } from './adapters/scoring-provider';

const oembed: OEmbedMetadata = {
  title: 'My Cover',
  authorName: 'Singer',
  authorUrl: 'https://youtube.com/@singer',
  thumbnailUrl: 'https://img/t.jpg',
  providerName: 'YouTube',
};

const scoring: ScoringResult = {
  initialAiScore: 73.5,
  breakdown: Object.fromEntries(CRITERIA.map((c) => [c, 73.5])) as ScoringResult['breakdown'],
  provisional: true,
  model: 'mock-provisional-v0',
  provider: 'mock',
};

describe('buildPerformanceCreate', () => {
  it('maps a valid URL + oEmbed + score into insert payloads', () => {
    const out = buildPerformanceCreate({
      userId: 'user-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      oembed,
      scoring,
    });

    expect(out.performance.youtube_video_id).toBe('dQw4w9WgXcQ');
    expect(out.performance.source).toBe('youtube');
    expect(out.performance.user_id).toBe('user-1');
    expect(out.performance.song_id).toBeNull();
    expect(out.performance.has_video).toBe(true);
    expect(out.performance.oembed_meta.title).toBe('My Cover');
  });

  it('initializes the score row with current = initial, trend = 0, provisional', () => {
    const { score } = buildPerformanceCreate({
      userId: 'u',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      oembed,
      scoring,
    });
    expect(score.initial_ai_score).toBe(73.5);
    expect(score.current_score).toBe(73.5);
    expect(score.trend_score).toBe(0);
    expect(score.listener_score).toBeNull();
    expect(score.verified_vote_count).toBe(0);
    expect(score.is_provisional).toBe(true);
    expect(score.ai_provider).toBe('mock');
    expect(score.ai_model).toBe('mock-provisional-v0');
  });

  it('passes through songId, hasVideo, and durationS overrides', () => {
    const out = buildPerformanceCreate({
      userId: 'u',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      oembed,
      scoring,
      songId: 'song-9',
      hasVideo: false,
      durationS: 210,
    });
    expect(out.performance.song_id).toBe('song-9');
    expect(out.performance.has_video).toBe(false);
    expect(out.performance.duration_s).toBe(210);
  });

  it('throws on an invalid YouTube URL', () => {
    expect(() =>
      buildPerformanceCreate({
        userId: 'u',
        youtubeUrl: 'https://example.com/not-youtube',
        oembed,
        scoring,
      }),
    ).toThrow(/valid YouTube/);
  });
});

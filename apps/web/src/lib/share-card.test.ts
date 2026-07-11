import { describe, expect, it } from 'vitest';
import { buildShareCardData } from './share-card';

describe('buildShareCardData', () => {
  it('maps oembed meta and score into the card view-model', () => {
    expect(
      buildShareCardData(
        { oembed_meta: { title: 'Hello (Cover)', authorName: 'Nicole Cross' } },
        { current_score: 68.71, is_provisional: true },
      ),
    ).toEqual({
      title: 'Hello (Cover)',
      authorName: 'Nicole Cross',
      scoreLabel: '68.7',
      isProvisional: true,
    });
  });

  it('renders a placeholder score and stays provisional when no score row exists', () => {
    const card = buildShareCardData({ oembed_meta: {} }, null);
    expect(card.scoreLabel).toBe('—');
    expect(card.isProvisional).toBe(true);
  });

  it('falls back to a generic title for a missing performance', () => {
    expect(buildShareCardData(null, null).title).toBe('VoxScore performance');
  });

  it('keeps a non-provisional flag when the score says so', () => {
    expect(
      buildShareCardData(null, { current_score: 80, is_provisional: false }).isProvisional,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildShareLine, scoreBar } from './share-line';

describe('scoreBar — 5-block emoji bar', () => {
  it('maps 0 to empty bar', () => {
    expect(scoreBar(0)).toBe('⬛⬛⬛⬛⬛');
  });
  it('maps 100 to full bar', () => {
    expect(scoreBar(100)).toBe('🟩🟩🟩🟩🟩');
  });
  it('rounds to nearest block (71.6 → 4 blocks)', () => {
    expect(scoreBar(71.6)).toBe('🟩🟩🟩🟩⬛');
  });
  it('clamps out-of-range input', () => {
    expect(scoreBar(120)).toBe('🟩🟩🟩🟩🟩');
    expect(scoreBar(-5)).toBe('⬛⬛⬛⬛⬛');
  });
});

describe('buildShareLine — copy-paste artifact', () => {
  it('joins headline, bar, url with newlines', () => {
    expect(
      buildShareLine({ headline: 'H', bar: '🟩⬛', url: 'https://voxscore.app/x' }),
    ).toBe('H\n🟩⬛\nhttps://voxscore.app/x');
  });
  it('omits the bar line when not provided', () => {
    expect(buildShareLine({ headline: 'H', url: 'https://voxscore.app/x' })).toBe(
      'H\nhttps://voxscore.app/x',
    );
  });
});

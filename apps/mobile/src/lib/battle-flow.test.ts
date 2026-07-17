import { describe, expect, it } from 'vitest';
import { battlePlaybackPhase } from './battle-flow';

describe('battlePlaybackPhase', () => {
  it('shows only side A until its full listen verifies', () => {
    expect(battlePlaybackPhase(false, false)).toBe('a');
    expect(battlePlaybackPhase(false, true)).toBe('a');
  });

  it('moves to side B only after A verifies', () => {
    expect(battlePlaybackPhase(true, false)).toBe('b');
  });

  it('removes both players after both listens verify', () => {
    expect(battlePlaybackPhase(true, true)).toBe('complete');
  });
});

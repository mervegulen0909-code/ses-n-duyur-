import { describe, expect, it } from 'vitest';
import { isSongCategory, songCategorySchema, songDifficultySchema } from './categories';

describe('isSongCategory', () => {
  it('is true for every controlled category', () => {
    expect(isSongCategory('pop')).toBe(true);
    expect(isSongCategory('other')).toBe(true);
  });

  it('is false for an unknown string, null, or undefined', () => {
    expect(isSongCategory('not-a-category')).toBe(false);
    expect(isSongCategory(null)).toBe(false);
    expect(isSongCategory(undefined)).toBe(false);
    expect(isSongCategory('')).toBe(false);
  });
});

describe('songCategorySchema / songDifficultySchema', () => {
  it('accepts controlled values and rejects anything else', () => {
    expect(songCategorySchema.safeParse('rock').success).toBe(true);
    expect(songCategorySchema.safeParse('nope').success).toBe(false);
    expect(songDifficultySchema.safeParse('easy').success).toBe(true);
    expect(songDifficultySchema.safeParse('impossible').success).toBe(false);
  });
});

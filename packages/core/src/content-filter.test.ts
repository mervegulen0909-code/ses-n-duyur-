import { describe, expect, it } from 'vitest';

import { containsObjectionableContent } from './content-filter';

describe('containsObjectionableContent', () => {
  it('blocks a plain obscenity', () => {
    expect(containsObjectionableContent('what the fuck is this')).toBe(true);
  });

  it('blocks regardless of case', () => {
    expect(containsObjectionableContent('CUNT')).toBe(true);
  });

  it('blocks Turkish terms with their original diacritics', () => {
    expect(containsObjectionableContent('sen tam bir piç')).toBe(true);
    expect(containsObjectionableContent('OROSPU')).toBe(true);
  });

  it('blocks non-English terms in the other shipped languages', () => {
    expect(containsObjectionableContent('quelle salope')).toBe(true);
    expect(containsObjectionableContent('eres un pendejo')).toBe(true);
  });

  // The evasion cases are the point of the filter — a plain word list catches
  // almost nothing in the wild.
  it('sees through leetspeak substitutions', () => {
    expect(containsObjectionableContent('f4ggot')).toBe(true);
    expect(containsObjectionableContent('wh0re')).toBe(true);
  });

  it('sees through letters split by punctuation or spaces', () => {
    expect(containsObjectionableContent('f.u.c.k this')).toBe(true);
    expect(containsObjectionableContent('c u n t')).toBe(true);
  });

  // False positives are the real risk: a comment section that rejects innocent
  // text is worse than one that occasionally needs a moderator.
  it('does not trip on words that merely contain a blocked substring', () => {
    for (const clean of [
      'I live in Scunthorpe',
      'a classic performance',
      'the analysis was thorough',
      'he can assess the pitch',
      'Matsushita released it',
      'she is a great assassin in the game',
    ]) {
      expect(containsObjectionableContent(clean)).toBe(false);
    }
  });

  it('leaves ordinary praise alone', () => {
    expect(containsObjectionableContent('Amazing vocals, the chorus gave me chills!')).toBe(false);
    expect(containsObjectionableContent('Harika bir performans olmuş, tebrikler.')).toBe(false);
  });

  it('does not collapse ordinary short words into a false match', () => {
    expect(containsObjectionableContent('I am a fan of it')).toBe(false);
  });

  it('handles empty and whitespace-only input', () => {
    expect(containsObjectionableContent('')).toBe(false);
    expect(containsObjectionableContent('   ')).toBe(false);
  });
});

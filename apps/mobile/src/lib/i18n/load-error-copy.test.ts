import { describe, expect, it } from 'vitest';

import ar from './locales/ar.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import tr from './locales/tr.json';
import zh from './locales/zh.json';

const locales = { ar, en, es, fr, hi, tr, zh };

describe('localized load errors', () => {
  it.each(Object.entries(locales))(
    '%s hides provider details and offers a retry action',
    (_locale, messages) => {
      expect(messages.Common.loadError).not.toContain('{{error}}');
      expect(messages.Common.loadError.length).toBeGreaterThan(0);
      expect(messages.Common.tryAgain.length).toBeGreaterThan(0);
    },
  );
});

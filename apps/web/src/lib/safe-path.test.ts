import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-path';

describe('safeInternalPath — open-redirect guard', () => {
  it('accepts a plain internal path', () => {
    expect(safeInternalPath('/song/abc?challenge=1')).toBe('/song/abc?challenge=1');
  });
  it.each(['//evil.com', 'https://evil.com', 'javascript:alert(1)', '', null])(
    'rejects %s',
    (raw) => {
      expect(safeInternalPath(raw as string | null)).toBe('/');
    },
  );
});

import { describe, expect, it } from 'vitest';
import { withAuthors, type ProfileLite, type RawComment } from './comments';

const comment = (over: Partial<RawComment> & { id: string }): RawComment => ({
  body: `body ${over.id}`,
  created_at: '2026-06-10T00:00:00Z',
  user_id: 'u1',
  ...over,
});

const profiles: ProfileLite[] = [
  { id: 'u1', handle: 'alice' },
  { id: 'u2', handle: 'bob' },
];

describe('withAuthors', () => {
  it('returns an empty list for no comments', () => {
    expect(withAuthors([], profiles)).toEqual([]);
  });

  it('attaches each comment author handle by user id', () => {
    const out = withAuthors([comment({ id: 'c1', user_id: 'u2' })], profiles);
    expect(out).toEqual([
      { id: 'c1', body: 'body c1', createdAt: '2026-06-10T00:00:00Z', authorHandle: 'bob' },
    ]);
  });

  it('resolves a missing author to null rather than throwing', () => {
    const out = withAuthors([comment({ id: 'c1', user_id: 'ghost' })], profiles);
    expect(out[0]).toMatchObject({ id: 'c1', authorHandle: null });
  });

  it('preserves input order', () => {
    const out = withAuthors(
      [comment({ id: 'c1' }), comment({ id: 'c2' }), comment({ id: 'c3' })],
      profiles,
    );
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
});

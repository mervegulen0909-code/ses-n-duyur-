/**
 * Joins comment rows to their authors' handles. Kept Supabase-free so it can be
 * unit-tested; the performance page fetches comments and the relevant profiles
 * (both world-readable via RLS) and hands them here. A missing author resolves
 * to `null` rather than throwing, so a since-deleted profile never breaks render.
 */
export interface RawComment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
}

export interface ProfileLite {
  id: string;
  handle: string;
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: string;
  authorHandle: string | null;
}

export function withAuthors(
  comments: readonly RawComment[],
  profiles: readonly ProfileLite[],
): CommentView[] {
  const handleById = new Map(profiles.map((p) => [p.id, p.handle]));
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    authorHandle: handleById.get(c.user_id) ?? null,
  }));
}

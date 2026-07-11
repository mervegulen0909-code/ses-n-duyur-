import { seasonCreateSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';

/**
 * Admin: open a new season. Closes whichever season is currently open
 * (`ends_at = now()`) before inserting the new one — at most one season is
 * ever open at a time, which is what `currentSeasonId()` relies on. `key` is
 * server-generated (`S<n>-<year>`), never client-supplied, so it can't
 * collide with the human-facing `title`.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = seasonCreateSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const startsAt = parsed.data.startsAt ?? new Date().toISOString();

  const { error: closeError } = await service
    .from('seasons')
    .update({ ends_at: new Date().toISOString() })
    .is('ends_at', null);
  if (closeError) {
    return Response.json({ error: 'Could not close the previous season' }, { status: 500 });
  }

  const { count } = await service.from('seasons').select('id', { count: 'exact', head: true });
  const key = `S${(count ?? 0) + 1}-${new Date(startsAt).getFullYear()}`;

  const { data: season, error } = await service
    .from('seasons')
    .insert({ key, title: parsed.data.title, starts_at: startsAt, ends_at: null })
    .select('id, key, title, starts_at')
    .single();
  if (error || !season) {
    if (error?.code === '23505') {
      return Response.json({ error: 'A season with this key already exists' }, { status: 409 });
    }
    return Response.json({ error: 'Could not create season' }, { status: 500 });
  }

  return Response.json(
    { id: season.id, key: season.key, title: season.title, startsAt: season.starts_at },
    { status: 201 },
  );
}

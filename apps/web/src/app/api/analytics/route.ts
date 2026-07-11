import { analyticsEventSchema } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { analyticsRateLimit } from '@/lib/guard';

/**
 * Privacy-preserving product analytics. Works signed-out (e.g. `landing_view`
 * fires before login) — the user id is attached only when a session exists.
 * No GET: events are read via admin SQL, never exposed to clients.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = analyticsEventSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input' }, { status: 422 });
  }

  const limited = await analyticsRateLimit(req, parsed.data.sessionId);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const ctx = await getRequestContext(req);

  const { error } = await service.from('analytics_events').insert({
    event: parsed.data.event,
    session_id: parsed.data.sessionId,
    user_id: ctx?.user.id ?? null,
    meta: (parsed.data.meta ?? null) as Json | null,
  });
  if (error) {
    return Response.json({ error: 'Could not record event' }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}

import { listenCompleteSchema, validateListen } from '@vocal-league/core';
import type { Json } from '@vocal-league/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = listenCompleteSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  // The listen session must exist, belong to this user, and match the performance.
  const { data: listen } = await supabase
    .from('verified_listens')
    .select('id, user_id, performance_id')
    .eq('id', parsed.data.listenId)
    .maybeSingle();

  if (
    !listen ||
    listen.user_id !== user.id ||
    listen.performance_id !== parsed.data.performanceId
  ) {
    return Response.json({ error: 'Listen session not found' }, { status: 404 });
  }

  // Server-side anti-cheat. The client cannot set is_valid itself (RLS).
  const result = validateListen(parsed.data.events, parsed.data.durationS);

  const service = createSupabaseServiceClient();
  if (!service) {
    return Response.json({ error: 'Server not configured to validate listens' }, { status: 503 });
  }

  const { error } = await service
    .from('verified_listens')
    .update({
      is_valid: result.isValid,
      watched_pct: result.watchedPct * 100,
      events: parsed.data.events as unknown as Json,
    })
    .eq('id', parsed.data.listenId);

  if (error) return Response.json({ error: 'Could not finalize listen' }, { status: 500 });

  return Response.json({
    isValid: result.isValid,
    watchedPct: result.watchedPct,
    reason: result.reason ?? null,
  });
}

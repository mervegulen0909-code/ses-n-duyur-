import { listenStartSchema } from '@voxscore/core';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * The verified-listen time-anchor is the core anti-bot cost — but only if
 * sessions can't run in PARALLEL (100 concurrent listens would pay the
 * wall-clock cost once for all of them). Cap open sessions per user.
 */
const MAX_OPEN_LISTENS = 3;
const OPEN_WINDOW_MIN = 30;

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = listenStartSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input' }, { status: 422 });
  }

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const openSince = new Date(Date.now() - OPEN_WINDOW_MIN * 60_000).toISOString();
  const { count: openCount } = await supabase
    .from('verified_listens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_valid', false)
    .gt('created_at', openSince);
  if ((openCount ?? 0) >= MAX_OPEN_LISTENS) {
    return Response.json(
      { error: 'Too many listening sessions in progress — finish one first' },
      { status: 429 },
    );
  }

  const { data, error } = await supabase
    .from('verified_listens')
    .insert({ user_id: user.id, performance_id: parsed.data.performanceId, is_valid: false })
    .select('id')
    .single();

  if (error || !data) {
    return Response.json({ error: 'Could not start listen session' }, { status: 500 });
  }
  return Response.json({ listenId: data.id }, { status: 201 });
}

import { listenStartSchema } from '@vocal-league/core';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

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

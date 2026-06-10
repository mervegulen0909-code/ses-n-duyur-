import { reportSchema } from '@vocal-league/core';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const { error } = await supabase.from('moderation_flags').insert({
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reporter_id: user.id,
    reason: parsed.data.reason,
  });
  if (error) return Response.json({ error: 'Could not file report' }, { status: 500 });

  return Response.json({ ok: true }, { status: 201 });
}

import { dmcaActionSchema } from '@vocal-league/core';
import { getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = dmcaActionSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { supabase } = ctx;
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('dmca_requests')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.requestId);
  if (error) return Response.json({ error: 'Could not update request' }, { status: 500 });

  // On a successful takedown, remove the performance from public view.
  if (parsed.data.status === 'actioned' && parsed.data.performanceId) {
    await supabase
      .from('performances')
      .update({ status: 'removed' })
      .eq('id', parsed.data.performanceId);
  }

  return Response.json({ ok: true });
}

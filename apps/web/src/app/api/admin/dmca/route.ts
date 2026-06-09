import { dmcaActionSchema } from '@vocal-league/core';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = dmcaActionSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json({ error: 'Supabase is not configured' }, { status: 503 });
  if (!(await isAdmin())) return Response.json({ error: 'Forbidden' }, { status: 403 });

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

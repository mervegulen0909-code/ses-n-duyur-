import { moderateSchema } from '@vocal-league/core';
import { getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = moderateSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { supabase } = ctx;
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('moderation_flags')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.flagId);
  if (error) return Response.json({ error: 'Could not update flag' }, { status: 500 });

  if (parsed.data.hidePerformanceId) {
    await supabase
      .from('performances')
      .update({ status: 'hidden' })
      .eq('id', parsed.data.hidePerformanceId);
  }

  return Response.json({ ok: true });
}

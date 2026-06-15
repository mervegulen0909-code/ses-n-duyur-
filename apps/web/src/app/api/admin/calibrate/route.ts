import { calibrateSchema } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = calibrateSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { supabase } = ctx;

  const profile = await getProfileForContext(ctx);
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase.from('admin_scores').insert({
    performance_id: parsed.data.performanceId,
    admin_id: profile.id,
    criteria: parsed.data.criteria as unknown as Json,
  });
  if (error) return Response.json({ error: 'Could not save calibration' }, { status: 500 });

  return Response.json({ ok: true }, { status: 201 });
}

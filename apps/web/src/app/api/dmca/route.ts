import { dmcaSchema } from '@vocal-league/core';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Public DMCA / takedown filing. Anyone may submit (RLS dmca_insert_any). */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = dmcaSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json({ error: 'Supabase is not configured' }, { status: 503 });

  const { error } = await supabase.from('dmca_requests').insert({
    performance_id: parsed.data.performanceId ?? null,
    claimant: parsed.data.claimant,
    details: parsed.data.details ?? null,
  });
  if (error) return Response.json({ error: 'Could not file request' }, { status: 500 });

  return Response.json({ ok: true }, { status: 201 });
}

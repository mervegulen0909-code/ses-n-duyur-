import { battlePredictSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';

/**
 * Predict a battle's winner — the listener game, NOT a vote (hard rules 4/5
 * stay untouched: no listen gate here, no Elo/score impact ever). The insert
 * runs AS THE USER so RLS is the real enforcement (open battle, pick within
 * the pair, one prediction per user); this route just shapes clean errors.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = battlePredictSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const { error } = await supabase.from('battle_predictions').insert({
    battle_id: parsed.data.battleId,
    user_id: user.id,
    predicted: parsed.data.predictedWinnerId,
  });
  if (error) {
    return Response.json(
      { error: 'Already predicted, battle closed, or invalid pick' },
      { status: 409 },
    );
  }

  const service = createSupabaseServiceClient();
  if (service) await trackServer(service, 'prediction_submitted', user.id, {});
  return Response.json({ ok: true }, { status: 201 });
}

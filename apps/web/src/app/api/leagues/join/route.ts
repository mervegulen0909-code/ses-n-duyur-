import { leagueJoinSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';

export async function POST(req: Request): Promise<Response> {
  let rawBody: string;
  let json: unknown;
  try {
    rawBody = await req.text();
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = leagueJoinSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid join code' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;
  const bot = await botGuard(req, ctx.user.id, rawBody);
  if (bot) return bot;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });
  const { data: league } = await service
    .from('custom_leagues')
    .select('id')
    .eq('join_code', parsed.data.code)
    .maybeSingle();
  if (!league) return Response.json({ error: 'League not found' }, { status: 404 });

  const { error } = await service.from('custom_league_members').insert({
    league_id: league.id,
    user_id: ctx.user.id,
  });
  if (error?.code === '23505') {
    return Response.json({ error: 'You already joined this league' }, { status: 409 });
  }
  if (error) return Response.json({ error: 'Could not join league' }, { status: 500 });
  return Response.json({ leagueId: league.id }, { status: 201 });
}

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { currentSeasonId } from '@/lib/seasons';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });
  const { data: membership } = await service
    .from('custom_league_members')
    .select('league_id')
    .eq('league_id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (!membership) return Response.json({ error: 'League not found' }, { status: 404 });

  const [{ data: league }, { data: memberRows }, seasonId] = await Promise.all([
    service.from('custom_leagues').select('id, name, join_code').eq('id', id).maybeSingle(),
    service.from('custom_league_members').select('user_id').eq('league_id', id),
    currentSeasonId(service),
  ]);
  if (!league) return Response.json({ error: 'League not found' }, { status: 404 });

  const userIds = (memberRows ?? []).map((row) => row.user_id);
  const { data: profiles } = userIds.length
    ? await service.from('profiles').select('id, handle, prediction_points').in('id', userIds)
    : { data: [] };
  const { data: performances } = userIds.length
    ? await service.from('performances').select('id, user_id').in('user_id', userIds)
    : { data: [] };
  const performanceOwner = new Map((performances ?? []).map((row) => [row.id, row.user_id]));
  let battleQuery = service
    .from('battles')
    .select('winner_performance_id')
    .eq('status', 'closed')
    .not('winner_performance_id', 'is', null);
  if (seasonId) battleQuery = battleQuery.eq('season_id', seasonId);
  const { data: battles } = performanceOwner.size
    ? await battleQuery.in('winner_performance_id', [...performanceOwner.keys()])
    : { data: [] };
  const wins = new Map<string, number>();
  for (const battle of battles ?? []) {
    if (!battle.winner_performance_id) continue;
    const owner = performanceOwner.get(battle.winner_performance_id);
    if (owner) wins.set(owner, (wins.get(owner) ?? 0) + 1);
  }

  const members = (profiles ?? [])
    .map((profile) => ({
      id: profile.id,
      handle: profile.handle,
      wins: wins.get(profile.id) ?? 0,
      predictionPoints: profile.prediction_points,
      isMe: profile.id === ctx.user.id,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.predictionPoints - a.predictionPoints ||
        a.handle.localeCompare(b.handle),
    );
  return Response.json({
    league: { id: league.id, name: league.name, joinCode: league.join_code },
    members,
  });
}

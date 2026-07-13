import { randomBytes } from 'node:crypto';
import { leagueCreateSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  return Array.from(randomBytes(8), (byte) => ALPHABET[byte & 31]).join('');
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });
  const { data: memberships, error: membershipError } = await service
    .from('custom_league_members')
    .select('league_id, joined_at')
    .eq('user_id', ctx.user.id)
    .order('joined_at', { ascending: false });
  if (membershipError) return Response.json({ error: 'Could not load leagues' }, { status: 500 });

  const ids = (memberships ?? []).map((row) => row.league_id);
  if (ids.length === 0) return Response.json({ leagues: [] });
  const { data: leagues, error } = await service
    .from('custom_leagues')
    .select('id, name, owner_id')
    .in('id', ids);
  if (error) return Response.json({ error: 'Could not load leagues' }, { status: 500 });
  const leagueById = new Map((leagues ?? []).map((league) => [league.id, league]));
  return Response.json({
    leagues: ids.flatMap((id) => {
      const league = leagueById.get(id);
      return league
        ? [{ id: league.id, name: league.name, isOwner: league.owner_id === ctx.user.id }]
        : [];
    }),
  });
}

export async function POST(req: Request): Promise<Response> {
  let rawBody: string;
  let json: unknown;
  try {
    rawBody = await req.text();
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = leagueCreateSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid league name' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;
  const bot = await botGuard(req, ctx.user.id, rawBody);
  if (bot) return bot;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  // A code collision is extremely unlikely, but retry it instead of surfacing
  // a random 500. The DB function also atomically enforces the 3-owned limit.
  for (let attempt = 0; attempt < 3; attempt++) {
    const joinCode = generateJoinCode();
    const { data: id, error } = await service.rpc('create_custom_league_atomic', {
      p_owner_id: ctx.user.id,
      p_name: parsed.data.name,
      p_join_code: joinCode,
    });
    if (!error && id) return Response.json({ id, joinCode }, { status: 201 });
    if (error?.message.includes('league_limit')) {
      return Response.json({ error: 'You can own at most 3 leagues' }, { status: 409 });
    }
    if (error?.code !== '23505') {
      return Response.json({ error: 'Could not create league' }, { status: 500 });
    }
  }
  return Response.json({ error: 'Could not allocate a join code' }, { status: 503 });
}

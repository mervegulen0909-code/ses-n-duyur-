import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

interface PerfRow {
  id: string;
  youtube_video_id: string | null;
  oembed_meta: unknown;
  song_id: string | null;
}

function pickPair(perfs: PerfRow[]): [PerfRow, PerfRow] | null {
  const shuffled = [...perfs].sort(() => Math.random() - 0.5);
  // Prefer two performances of the same song.
  const bySong = new Map<string, PerfRow[]>();
  for (const p of shuffled) {
    if (!p.song_id) continue;
    const arr = bySong.get(p.song_id) ?? [];
    arr.push(p);
    bySong.set(p.song_id, arr);
  }
  for (const arr of bySong.values()) {
    if (arr.length >= 2) return [arr[0]!, arr[1]!];
  }
  if (shuffled.length >= 2) return [shuffled[0]!, shuffled[1]!];
  return null;
}

function titleOf(meta: unknown): string {
  const m = (meta ?? {}) as { title?: string };
  return m.title ?? 'Performance';
}

export async function POST(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });

  // This route inserts battle rows via the service role (bypassing the
  // admin-only RLS insert policy), so rate-limit per user to stop a single
  // caller flooding public.battles.
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: perfs } = await service
    .from('performances')
    .select('id, youtube_video_id, oembed_meta, song_id')
    .eq('status', 'active')
    .not('youtube_video_id', 'is', null)
    .limit(50);

  const pair = pickPair((perfs ?? []) as PerfRow[]);
  if (!pair) {
    return Response.json({ error: 'Not enough performances to battle yet' }, { status: 404 });
  }
  const [a, b] = pair;

  const { data: battle, error } = await service
    .from('battles')
    .insert({ song_id: a.song_id ?? b.song_id ?? null, perf_a: a.id, perf_b: b.id, status: 'open' })
    .select('id')
    .single();

  if (error || !battle) {
    return Response.json({ error: 'Could not create battle' }, { status: 500 });
  }

  return Response.json({
    battleId: battle.id,
    a: { performanceId: a.id, videoId: a.youtube_video_id, title: titleOf(a.oembed_meta) },
    b: { performanceId: b.id, videoId: b.youtube_video_id, title: titleOf(b.oembed_meta) },
  });
}

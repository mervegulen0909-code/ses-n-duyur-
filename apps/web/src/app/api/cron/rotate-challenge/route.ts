import { createSupabaseServiceClient } from '@/lib/supabase/server';

/** A challenge younger than this is left alone — makes daily cron runs a no-op
 *  until the current week is over, so a missed run self-heals the next day. */
const CHALLENGE_DAYS = 7;
/** A song needs two active performances before it can headline a battle week. */
const MIN_PERFORMANCES = 2;

interface Pickable {
  songId: string;
  performances: number;
  lastFeaturedAt: string | null;
}

/**
 * Choose next week's song: never-featured songs first, then the one whose
 * last feature is oldest; ties break toward more performances, then song id
 * so the rotation is fully deterministic.
 */
export function pickNextSong(candidates: readonly Pickable[]): Pickable | null {
  const eligible = candidates.filter((c) => c.performances >= MIN_PERFORMANCES);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => {
    if (!a.lastFeaturedAt !== !b.lastFeaturedAt) return a.lastFeaturedAt ? 1 : -1;
    if (a.lastFeaturedAt && b.lastFeaturedAt && a.lastFeaturedAt !== b.lastFeaturedAt) {
      return a.lastFeaturedAt < b.lastFeaturedAt ? -1 : 1;
    }
    if (b.performances !== a.performances) return b.performances - a.performances;
    return a.songId.localeCompare(b.songId);
  });
  return sorted[0] ?? null;
}

/**
 * Weekly challenge rotation. Vercel Cron hits this daily (Hobby plan floor);
 * the route only rotates when the current challenge has run its week —
 * closing it (ends_at = now) and opening a new one for the picked song.
 * Same auth contract as /api/cron/send-notifications: Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, everything else is rejected.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const now = new Date();
  const cutoff = new Date(now.getTime() - CHALLENGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Still mid-week? Leave the running challenge alone.
  const { data: active } = await service
    .from('featured_challenges')
    .select('id, song_id, starts_at')
    .is('ends_at', null)
    .gt('starts_at', cutoff)
    .limit(1)
    .maybeSingle();
  if (active) {
    return Response.json({ rotated: false, reason: 'active-challenge' });
  }

  // Candidates: active performances grouped by song, joined (in JS — this
  // codebase never uses nested embeds) with each song's last-featured time.
  const { data: perfs, error: perfsError } = await service
    .from('performances')
    .select('song_id')
    .eq('status', 'active')
    .not('song_id', 'is', null);
  if (perfsError) {
    return Response.json({ error: 'Could not load performances' }, { status: 500 });
  }
  const countBySong = new Map<string, number>();
  for (const p of perfs ?? []) {
    if (p.song_id) countBySong.set(p.song_id, (countBySong.get(p.song_id) ?? 0) + 1);
  }

  const { data: history } = await service
    .from('featured_challenges')
    .select('song_id, starts_at')
    .order('starts_at', { ascending: false });
  const lastFeatured = new Map<string, string>();
  for (const h of history ?? []) {
    if (!lastFeatured.has(h.song_id)) lastFeatured.set(h.song_id, h.starts_at);
  }

  const pick = pickNextSong(
    [...countBySong.entries()].map(([songId, performances]) => ({
      songId,
      performances,
      lastFeaturedAt: lastFeatured.get(songId) ?? null,
    })),
  );
  if (!pick) return Response.json({ rotated: false, reason: 'no-eligible-song' });

  const { data: song } = await service
    .from('songs')
    .select('title, artist')
    .eq('id', pick.songId)
    .maybeSingle();
  if (!song) return Response.json({ rotated: false, reason: 'song-missing' });

  // Close whatever is still open BEFORE inserting, so the homepage's
  // "active window" query can never see two open challenges.
  const { error: closeError } = await service
    .from('featured_challenges')
    .update({ ends_at: now.toISOString() })
    .is('ends_at', null);
  if (closeError) {
    return Response.json({ error: 'Could not close the previous challenge' }, { status: 500 });
  }

  const endsAt = new Date(now.getTime() + CHALLENGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await service.from('featured_challenges').insert({
    song_id: pick.songId,
    title: `Who sings “${song.title}” best?`,
    starts_at: now.toISOString(),
    ends_at: endsAt,
  });
  if (insertError) {
    return Response.json({ error: 'Could not open the new challenge' }, { status: 500 });
  }

  return Response.json({ rotated: true, songId: pick.songId, endsAt });
}

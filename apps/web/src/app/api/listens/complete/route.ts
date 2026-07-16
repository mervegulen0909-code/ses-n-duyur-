import {
  listenCompleteSchema,
  validateListen,
  streakTier,
  MIN_VERIFIED_LISTEN_SECONDS,
} from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';
import { grantBadge } from '@/lib/badges';
import { currentListenStreak } from '@/lib/streak-server';
import { addLeaguePoints } from '@/lib/league-points';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = listenCompleteSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  // The listen session must exist, belong to this user, and match the performance.
  // `created_at` is the SERVER-recorded session start — our wall-clock anchor.
  const { data: listen } = await supabase
    .from('verified_listens')
    .select('id, user_id, performance_id, created_at, is_valid, watched_pct')
    .eq('id', parsed.data.listenId)
    .maybeSingle();

  if (
    !listen ||
    listen.user_id !== user.id ||
    listen.performance_id !== parsed.data.performanceId
  ) {
    return Response.json({ error: 'Listen session not found' }, { status: 404 });
  }

  // Finalization is idempotent. Once a session is valid, a replay must never
  // revoke it, duplicate analytics/badges, or award league points again.
  if (listen.is_valid) {
    return Response.json({
      isValid: true,
      watchedPct: Number(listen.watched_pct) / 100,
      reason: null,
    });
  }

  // Server-side anti-cheat. The client cannot set is_valid itself (RLS).
  // Anchor the decision to facts the SERVER owns — the real wall-clock elapsed
  // since the session started, and an absolute minimum playback floor — so a
  // forged event trail / tiny `durationS` cannot unlock voting (Hard Rule 4).
  const serverElapsedS = (Date.now() - Date.parse(listen.created_at)) / 1000;
  const result = validateListen(parsed.data.events, parsed.data.durationS, {
    serverElapsedS,
    minWatchSeconds: MIN_VERIFIED_LISTEN_SECONDS,
    // Temporary preview flow: one genuine second unlocks voting without
    // requiring 90% coverage of the full YouTube video.
    minWatchedPct: 0,
  });

  const service = createSupabaseServiceClient();
  if (!service) {
    return Response.json({ error: 'Server not configured to validate listens' }, { status: 503 });
  }

  const { data: finalized, error } = await service
    .from('verified_listens')
    .update({
      is_valid: result.isValid,
      watched_pct: result.watchedPct * 100,
      events: parsed.data.events as unknown as Json,
    })
    .eq('id', parsed.data.listenId)
    .eq('is_valid', false)
    .select('id')
    .maybeSingle();

  if (error) return Response.json({ error: 'Could not finalize listen' }, { status: 500 });

  // The conditional update is an atomic claim. Under concurrent valid
  // completions only the request that flipped false -> true runs side effects.
  if (result.isValid && finalized) {
    await trackServer(service, 'verified_listen_completed', user.id, {
      performanceId: parsed.data.performanceId,
    });

    // Trusted Ear streak badges: grant speculatively at every tier unlock —
    // grantBadge is idempotent (ON CONFLICT DO NOTHING), so no bookkeeping.
    const today = new Date().toISOString().slice(0, 10);
    const streak = await currentListenStreak(service, user.id, today);
    const tier = streakTier(streak);
    if (tier === 'bronze') await grantBadge(service, user.id, 'trusted_ear_bronze');
    if (tier === 'silver') await grantBadge(service, user.id, 'trusted_ear_silver');
    if (tier === 'gold') await grantBadge(service, user.id, 'trusted_ear_gold');

    // Weekly league: a valid verified listen is worth +1 this week.
    await addLeaguePoints(service, user.id, 1, {
      kind: 'verified_listen',
      id: parsed.data.listenId,
    });
  }

  return Response.json({
    isValid: result.isValid,
    watchedPct: result.watchedPct,
    reason: result.reason ?? null,
  });
}

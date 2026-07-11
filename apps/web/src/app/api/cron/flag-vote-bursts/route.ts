import { createSupabaseServiceClient } from '@/lib/supabase/server';

/** Scan window: one nightly run looks back over the previous day of votes. */
const WINDOW_HOURS = 24;
/** Only performances at least this hot in the window are scanned at all. */
const MIN_BURST_VOTES = 5;
/** Distinct voters sharing one network hash before we call it a brigade. */
const MIN_CLUSTER_VOTERS = 3;

/** Dedupe key: one OPEN flag with this reason per performance is enough. */
export const AUTO_FLAG_REASON = 'auto: vote burst from a single network';

/**
 * Nightly vote-burst detector (A3). Votes carry a verified listen, and
 * listens/start records a salted network hash (see lib/ip-hash.ts) — so a
 * performance where several "different" voters all arrive from one network
 * inside a day is a brigade candidate. We only FLAG for human moderation
 * (moderation_flags), never auto-remove: shared networks (campus, café)
 * are legitimate, so the final call stays with a moderator. Same auth
 * contract as the other crons: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const { data: votes, error: votesError } = await service
    .from('criteria_ratings')
    .select('performance_id, voter_id, verified_listen_id')
    .gte('created_at', since);
  if (votesError) {
    return Response.json({ error: 'Could not load recent votes' }, { status: 500 });
  }

  const byPerformance = new Map<string, { voterId: string; listenId: string }[]>();
  for (const v of votes ?? []) {
    const list = byPerformance.get(v.performance_id) ?? [];
    list.push({ voterId: v.voter_id, listenId: v.verified_listen_id });
    byPerformance.set(v.performance_id, list);
  }
  const candidates = [...byPerformance.entries()].filter(
    ([, list]) => list.length >= MIN_BURST_VOTES,
  );
  if (candidates.length === 0) return Response.json({ scanned: 0, flagged: 0 });

  const listenIds = candidates.flatMap(([, list]) => list.map((v) => v.listenId));
  const { data: listens, error: listensError } = await service
    .from('verified_listens')
    .select('id, ip_hash')
    .in('id', listenIds)
    .not('ip_hash', 'is', null);
  if (listensError) {
    return Response.json({ error: 'Could not load listen hashes' }, { status: 500 });
  }
  const hashByListen = new Map((listens ?? []).map((l) => [l.id, l.ip_hash as string]));

  const suspects: string[] = [];
  for (const [performanceId, list] of candidates) {
    const votersByHash = new Map<string, Set<string>>();
    for (const { voterId, listenId } of list) {
      const hash = hashByListen.get(listenId);
      if (!hash) continue; // hash-less listens (no header/salt) can't cluster
      const votersHere = votersByHash.get(hash) ?? new Set<string>();
      votersHere.add(voterId);
      votersByHash.set(hash, votersHere);
    }
    if ([...votersByHash.values()].some((s) => s.size >= MIN_CLUSTER_VOTERS)) {
      suspects.push(performanceId);
    }
  }
  if (suspects.length === 0) {
    return Response.json({ scanned: candidates.length, flagged: 0 });
  }

  const { data: existing, error: existingError } = await service
    .from('moderation_flags')
    .select('target_id')
    .eq('target_type', 'performance')
    .eq('status', 'open')
    .eq('reason', AUTO_FLAG_REASON)
    .in('target_id', suspects);
  if (existingError) {
    return Response.json({ error: 'Could not load open flags' }, { status: 500 });
  }
  const alreadyFlagged = new Set((existing ?? []).map((f) => f.target_id));

  const rows = suspects
    .filter((id) => !alreadyFlagged.has(id))
    .map((target_id) => ({
      target_type: 'performance' as const,
      target_id,
      reporter_id: null,
      reason: AUTO_FLAG_REASON,
    }));
  if (rows.length > 0) {
    const { error: insertError } = await service.from('moderation_flags').insert(rows);
    if (insertError) {
      return Response.json({ error: 'Could not insert flags' }, { status: 500 });
    }
  }
  return Response.json({ scanned: candidates.length, flagged: rows.length });
}

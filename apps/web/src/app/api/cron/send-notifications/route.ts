import type { NotificationKind } from '@voxscore/core';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { sendExpoPush, type ExpoPushMessage } from '@/lib/expo-push';

/** Bounds one cron invocation's work; the next run drains any remainder. */
const BATCH_LIMIT = 200;

const COPY: Record<NotificationKind, { title: string; body: string }> = {
  battle_challenge: { title: 'New battle', body: 'A new battle pairing is ready for you.' },
  new_vote: { title: 'New vote', body: 'Someone just voted on your performance.' },
  rank_change: { title: 'Rank update', body: 'Your ranking on VoxScore changed.' },
  comment_reply: { title: 'New reply', body: 'Someone replied to your comment.' },
  performance_request_approved: {
    title: 'Request approved',
    body: 'Your performance request was approved — it’s live!',
  },
  performance_request_rejected: {
    title: 'Request update',
    body: 'Your performance request was not approved.',
  },
};

/**
 * Drains public.notification_events (sent_at is null) and fans out via the
 * Expo Push API against push_tokens. Triggered by Vercel Cron (vercel.json)
 * on a schedule; Vercel sends `Authorization: Bearer $CRON_SECRET` when that
 * env var is configured — reject anything else so this never runs from an
 * arbitrary caller.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: pending, error: pendingError } = await service
    .from('notification_events')
    .select('id, user_id, kind, meta')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (pendingError) {
    return Response.json({ error: 'Could not load pending notifications' }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return Response.json({ processed: 0, sent: 0, pruned: 0 });
  }

  const userIds = [...new Set(pending.map((p) => p.user_id))];
  const { data: tokens } = await service
    .from('push_tokens')
    .select('id, user_id, token')
    .in('user_id', userIds);
  const tokensByUser = new Map<string, { id: string; token: string }[]>();
  for (const t of tokens ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push({ id: t.id, token: t.token });
    tokensByUser.set(t.user_id, list);
  }

  const messages: ExpoPushMessage[] = [];
  const messageTokenIds: string[] = [];
  for (const event of pending) {
    const copy = COPY[event.kind];
    for (const t of tokensByUser.get(event.user_id) ?? []) {
      messages.push({
        to: t.token,
        title: copy.title,
        body: copy.body,
        data: (event.meta as Record<string, unknown> | null) ?? {},
      });
      messageTokenIds.push(t.id);
    }
  }

  const tickets = messages.length ? await sendExpoPush(messages) : [];

  // Prune tokens Expo reports as permanently invalid.
  const staleTokenIds = [
    ...new Set(
      tickets
        .map((ticket, i) =>
          ticket.details?.error === 'DeviceNotRegistered' ? messageTokenIds[i] : null,
        )
        .filter((id): id is string => !!id),
    ),
  ];
  if (staleTokenIds.length > 0) {
    await service.from('push_tokens').delete().in('id', staleTokenIds);
  }

  // Every pending event was attempted (even users with zero tokens get
  // marked processed) — the next cron run only ever sees NEW events.
  await service
    .from('notification_events')
    .update({ sent_at: new Date().toISOString() })
    .in(
      'id',
      pending.map((p) => p.id),
    );

  return Response.json({
    processed: pending.length,
    sent: tickets.filter((t) => t.status === 'ok').length,
    pruned: staleTokenIds.length,
  });
}

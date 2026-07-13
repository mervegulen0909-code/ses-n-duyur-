import type { NotificationKind } from '@voxscore/core';
import type { Database } from '@voxscore/db';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { sendExpoPush, type ExpoPushMessage, type ExpoPushTicket } from '@/lib/expo-push';
import { notificationCopy } from '@/lib/notification-copy';

const BATCH_LIMIT = 200;
const MAX_ATTEMPTS = 5;

interface ClaimedEvent {
  id: string;
  user_id: string;
  kind: NotificationKind;
  meta: Record<string, unknown> | null;
  attempt_count: number;
}

interface MessageRef {
  eventId: string;
  tokenId: string;
}

type NotificationPatch = Database['public']['Tables']['notification_events']['Update'];

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attemptCount - 1));
}

function ticketsForEvent(
  eventId: string,
  tickets: readonly ExpoPushTicket[],
  refs: readonly MessageRef[],
): ExpoPushTicket[] {
  return tickets.filter((_, index) => refs[index]?.eventId === eventId);
}

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });
  const client = service;

  const { data, error: claimError } = await service.rpc('claim_notification_events', {
    p_limit: BATCH_LIMIT,
  });
  if (claimError) {
    return Response.json({ error: 'Could not claim pending notifications' }, { status: 500 });
  }
  const pending = (data ?? []) as ClaimedEvent[];
  if (pending.length === 0) {
    return Response.json({
      processed: 0,
      sent: 0,
      retried: 0,
      deadLettered: 0,
      noTokens: 0,
      pruned: 0,
    });
  }

  const userIds = [...new Set(pending.map((event) => event.user_id))];
  const { data: tokens, error: tokenError } = await service
    .from('push_tokens')
    .select('id, user_id, token')
    .in('user_id', userIds);

  if (tokenError) {
    const nextAttempt = new Date(Date.now() + 60_000).toISOString();
    const { error: releaseError } = await service
      .from('notification_events')
      .update({
        delivery_status: 'pending',
        locked_at: null,
        last_error: 'push_token_lookup_failed',
        next_attempt_at: nextAttempt,
      })
      .in(
        'id',
        pending.map((event) => event.id),
      );
    return Response.json(
      {
        error: releaseError
          ? 'Could not release notification claims'
          : 'Could not load push tokens',
      },
      { status: 500 },
    );
  }

  const tokensByUser = new Map<string, { id: string; token: string }[]>();
  for (const token of tokens ?? []) {
    const list = tokensByUser.get(token.user_id) ?? [];
    list.push({ id: token.id, token: token.token });
    tokensByUser.set(token.user_id, list);
  }

  const { data: profiles } = await service.from('profiles').select('id, locale').in('id', userIds);
  const localesByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile.locale]));

  const messages: ExpoPushMessage[] = [];
  const refs: MessageRef[] = [];
  for (const event of pending) {
    const copy = notificationCopy(event.kind, localesByUser.get(event.user_id));
    for (const token of tokensByUser.get(event.user_id) ?? []) {
      messages.push({
        to: token.token,
        title: copy.title,
        body: copy.body,
        data: event.meta ?? {},
      });
      refs.push({ eventId: event.id, tokenId: token.id });
    }
  }

  const tickets = messages.length ? await sendExpoPush(messages) : [];
  const staleTokenIds = [
    ...new Set(
      tickets
        .map((ticket, index) =>
          ticket.details?.error === 'DeviceNotRegistered' ? refs[index]?.tokenId : undefined,
        )
        .filter((id): id is string => !!id),
    ),
  ];
  if (staleTokenIds.length > 0) {
    await service.from('push_tokens').delete().in('id', staleTokenIds);
  }

  const sentIds: string[] = [];
  const noTokenIds: string[] = [];
  const deadIds: string[] = [];
  const retryGroups = new Map<number, string[]>();

  for (const event of pending) {
    const eventTokens = tokensByUser.get(event.user_id) ?? [];
    if (eventTokens.length === 0) {
      noTokenIds.push(event.id);
      continue;
    }

    const eventTickets = ticketsForEvent(event.id, tickets, refs);
    if (eventTickets.some((ticket) => ticket.status === 'ok')) {
      sentIds.push(event.id);
      continue;
    }
    if (
      eventTickets.length > 0 &&
      eventTickets.every((ticket) => ticket.details?.error === 'DeviceNotRegistered')
    ) {
      noTokenIds.push(event.id);
      continue;
    }
    if (event.attempt_count >= MAX_ATTEMPTS) {
      deadIds.push(event.id);
      continue;
    }
    const delay = retryDelaySeconds(event.attempt_count);
    retryGroups.set(delay, [...(retryGroups.get(delay) ?? []), event.id]);
  }

  const now = new Date().toISOString();
  const updateErrors: unknown[] = [];
  async function updateEvents(ids: string[], patch: NotificationPatch): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await client.from('notification_events').update(patch).in('id', ids);
    if (error) updateErrors.push(error);
  }

  await updateEvents(sentIds, {
    delivery_status: 'sent',
    sent_at: now,
    locked_at: null,
    last_error: null,
  });
  await updateEvents(noTokenIds, {
    delivery_status: 'no_tokens',
    sent_at: now,
    locked_at: null,
    last_error: 'no_reachable_push_token',
  });
  await updateEvents(deadIds, {
    delivery_status: 'dead_letter',
    locked_at: null,
    last_error: 'push_delivery_failed_after_max_attempts',
  });
  for (const [delay, ids] of retryGroups) {
    await updateEvents(ids, {
      delivery_status: 'pending',
      locked_at: null,
      last_error: 'transient_push_delivery_failure',
      next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
    });
  }

  if (updateErrors.length > 0) {
    console.error('[send-notifications] queue state update failed', {
      failures: updateErrors.length,
    });
    return Response.json(
      { error: 'Could not update notification delivery state' },
      { status: 500 },
    );
  }

  return Response.json({
    processed: pending.length,
    sent: sentIds.length,
    retried: [...retryGroups.values()].reduce((sum, ids) => sum + ids.length, 0),
    deadLettered: deadIds.length,
    noTokens: noTokenIds.length,
    pruned: staleTokenIds.length,
  });
}

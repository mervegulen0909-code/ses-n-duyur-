import 'server-only';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo caps a single push request at 100 messages. */
const CHUNK_SIZE = 100;

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Send a batch of Expo push messages, chunked to Expo's 100-per-request
 * limit, and return one ticket per message IN THE SAME ORDER — callers can
 * zip tickets[i] back to messages[i] to prune DeviceNotRegistered tokens.
 * A chunk-level network/HTTP failure yields an 'error' ticket for each of
 * that chunk's messages rather than throwing, so one bad chunk never drops
 * the rest of the batch.
 */
export async function sendExpoPush(
  messages: readonly ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  const tickets: ExpoPushTicket[] = [];
  for (const batch of chunk(messages, CHUNK_SIZE)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const json = (await res.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null;
      const batchTickets = json?.data;
      if (!res.ok || !batchTickets || batchTickets.length !== batch.length) {
        tickets.push(...batch.map(() => ({ status: 'error' as const, message: 'send failed' })));
        continue;
      }
      tickets.push(...batchTickets);
    } catch {
      tickets.push(...batch.map(() => ({ status: 'error' as const, message: 'network error' })));
    }
  }
  return tickets;
}

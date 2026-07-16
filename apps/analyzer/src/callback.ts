import type { AnalyzerResult } from '@voxscore/core';
import { signCallbackBody } from './auth';

// Delivery is at-least-once: the web callback's finalize_ai_analysis RPC is
// idempotent (a retried callback returns the original result id), so a retry
// after a lost response cannot double-finalize a session.
export const CALLBACK_MAX_ATTEMPTS = 3;
export const CALLBACK_RETRY_DELAYS_MS: readonly number[] = [1_000, 4_000];

export interface CallbackDeliveryOptions {
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Other 4xx means a bad body or signature: the same payload cannot succeed on
// a retry, so fail fast instead of holding the upload response open.
const isRetryableStatus = (status: number): boolean =>
  status >= 500 || status === 408 || status === 429;

export async function deliverCallback(
  result: AnalyzerResult,
  callbackUrl: string,
  secret: string,
  { fetchImpl = fetch, sleep = defaultSleep }: CallbackDeliveryOptions = {},
): Promise<void> {
  const body = JSON.stringify(result);
  let lastError = new Error('Analyzer callback failed');
  for (let attempt = 1; attempt <= CALLBACK_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(CALLBACK_RETRY_DELAYS_MS[attempt - 2] ?? 4_000);
    // The signature binds the timestamp, so re-sign per attempt to stay inside
    // the receiver's freshness window across backoff delays.
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signCallbackBody(body, secret, timestamp);
    let response: Response;
    try {
      response = await fetchImpl(callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-voxscore-timestamp': timestamp,
          'x-voxscore-signature': signature,
        },
        body,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Analyzer callback fetch failed');
      console.error(
        `[analyzer] callback attempt ${attempt}/${CALLBACK_MAX_ATTEMPTS} errored: ${lastError.message}`,
      );
      continue;
    }
    if (response.ok) return;
    lastError = new Error(`Analyzer callback failed with ${response.status}`);
    if (!isRetryableStatus(response.status)) break;
    console.error(
      `[analyzer] callback attempt ${attempt}/${CALLBACK_MAX_ATTEMPTS} failed with ${response.status}`,
    );
  }
  throw lastError;
}

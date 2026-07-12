import 'server-only';
import { NoopBotCheck, type BotCheck } from '@voxscore/core';

/**
 * TurnstileBotCheck — verifies a Cloudflare Turnstile token server-side.
 * Activated by getBotCheck() only when TURNSTILE_SECRET_KEY is set; otherwise
 * the dev no-op (always passes) is used.
 */
export class TurnstileBotCheck implements BotCheck {
  constructor(private readonly secret: string) {}

  async verify(token: string | null): Promise<boolean> {
    if (!token) return false;
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.secret, response: token }),
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch {
      return false;
    }
  }
}

/** Production must never silently replace bot protection with a pass-through. */
export class FailClosedBotCheck implements BotCheck {
  async verify(): Promise<boolean> {
    return false;
  }
}

export function getBotCheck(): BotCheck {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret) return new TurnstileBotCheck(secret);
  return process.env.NODE_ENV === 'production' ? new FailClosedBotCheck() : new NoopBotCheck();
}

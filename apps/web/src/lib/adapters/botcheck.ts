import 'server-only';
import { NoopBotCheck, type BotCheck } from '@vocal-league/core';

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

export function getBotCheck(): BotCheck {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  return secret ? new TurnstileBotCheck(secret) : new NoopBotCheck();
}

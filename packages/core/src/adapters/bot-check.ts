export interface BotCheck {
  /** Verify a challenge token (e.g. Turnstile). Returns true when human. */
  verify(token: string | null): Promise<boolean>;
}

/**
 * NoopBotCheck — always passes. Used in development where no Turnstile key is
 * configured. Faz J swaps in a TurnstileBotCheck behind the same interface.
 */
export class NoopBotCheck implements BotCheck {
  async verify(_token: string | null): Promise<boolean> {
    return true;
  }
}

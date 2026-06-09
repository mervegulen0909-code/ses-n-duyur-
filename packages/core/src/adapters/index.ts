import { MockScoringProvider, type ScoringProvider } from './scoring-provider';
import { InMemoryRateLimiter, type RateLimiter } from './rate-limiter';
import { NoopBotCheck, type BotCheck } from './bot-check';

export * from './scoring-provider';
export * from './rate-limiter';
export * from './bot-check';

/**
 * Adapter factories. Today they return development mocks; in Faz J each gets a
 * branch that returns the real implementation when its env key is present. This
 * is the single seam where real secrets enter the system.
 */

export function createScoringProvider(): ScoringProvider {
  // Faz J: if (env.ANTHROPIC_API_KEY) return new AnthropicScoringProvider(...)
  return new MockScoringProvider();
}

export function createRateLimiter(limit = 30, windowMs = 60_000): RateLimiter {
  // Faz J: if (env.UPSTASH_REDIS_REST_URL) return new UpstashRateLimiter(...)
  return new InMemoryRateLimiter(limit, windowMs);
}

export function createBotCheck(): BotCheck {
  // Faz J: if (env.TURNSTILE_SECRET_KEY) return new TurnstileBotCheck(...)
  return new NoopBotCheck();
}

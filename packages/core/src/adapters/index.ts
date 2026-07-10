import { MockScoringProvider, type ScoringProvider } from './scoring-provider';
import { InMemoryRateLimiter, type RateLimiter } from './rate-limiter';
import { NoopBotCheck, type BotCheck } from './bot-check';

export * from './scoring-provider';
export * from './song-extractor';
export * from './rate-limiter';
export * from './bot-check';

/**
 * Mock-only adapter factories for the shared core package.
 *
 * The REAL, env-gated factories live in the web app at
 * `apps/web/src/lib/adapters/{scoring,ratelimit,botcheck}.ts` — they carry
 * `import 'server-only'` and the provider SDKs (`@anthropic-ai/sdk`, `openai`,
 * `@upstash/*`), which are web-app dependencies, not core dependencies. Server
 * code MUST use those factories (`getScoringProvider()`, etc.) so the real
 * provider activates when its key is present.
 *
 * These core factories always return the deterministic mock. They exist for
 * pure, SDK-free unit tests and are intentionally NOT wired into any request
 * path. Do not add "real" branches here — they belong in the web adapters.
 */

export function createScoringProvider(): ScoringProvider {
  return new MockScoringProvider();
}

export function createRateLimiter(limit = 30, windowMs = 60_000): RateLimiter {
  return new InMemoryRateLimiter(limit, windowMs);
}

export function createBotCheck(): BotCheck {
  return new NoopBotCheck();
}

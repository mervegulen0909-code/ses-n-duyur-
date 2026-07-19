import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  timeout: 90_000,
  use: { baseURL, trace: 'on-first-retry', navigationTimeout: 60_000, actionTimeout: 15_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Run against a production build (no per-route dev compilation) so navigation
  // is fast and reliable even on a busy machine.
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // See apps/web/src/lib/adapters/ratelimit.ts: a production build with no
    // Upstash configured fails closed (429s every mutating call) by design.
    // This E2E-only flag opts back into the in-memory limiter so
    // authenticated-flows.spec.ts can exercise real write endpoints.
    env: { E2E_IN_MEMORY_RATE_LIMIT: '1' },
  },
});

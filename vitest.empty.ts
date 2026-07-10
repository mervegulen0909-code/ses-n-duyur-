// Empty stub used by vitest to resolve the `server-only` / `client-only` marker
// packages. Those packages throw by design when bundled outside their intended
// (server/client) environment; under vitest (plain Node) we alias them to this
// no-op so server-only modules can be unit-tested directly. See vitest.config.ts.
export {};

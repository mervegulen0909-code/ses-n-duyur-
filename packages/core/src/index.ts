/**
 * @vocal-league/core — shared domain layer.
 *
 * Zod schemas (validate every API input), keyless YouTube/oEmbed helpers, and
 * the adapter seam (scoring/rate-limit/bot-check) that keeps all real secrets
 * deferred to Faz J behind mockable interfaces.
 */
export * from './youtube';
export * from './schemas';
export * from './performance';
export * from './listen';
export * from './score-update';
export * from './adapters/index';

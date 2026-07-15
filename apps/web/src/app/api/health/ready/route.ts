import { createSupabaseServiceClient } from '@/lib/supabase/server';

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'CRON_SECRET',
  'ANTI_ABUSE_SALT',
] as const;

/** Deployment readiness probe; returns names only, never secret values. */
export async function GET(): Promise<Response> {
  const missing: string[] = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL) {
    missing.push('UPSTASH_REDIS_REST_URL');
  }
  if (!process.env.UPSTASH_REDIS_REST_TOKEN && !process.env.KV_REST_API_TOKEN) {
    missing.push('UPSTASH_REDIS_REST_TOKEN');
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    missing.push('ANTHROPIC_API_KEY');
  }
  if (process.env.NATIVE_ATTESTATION_REQUIRED === 'true') {
    if (!process.env.GOOGLE_PLAY_PACKAGE_NAME) missing.push('GOOGLE_PLAY_PACKAGE_NAME');
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64)
      missing.push('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64');
    if (!process.env.GOOGLE_PLAY_CERT_SHA256) missing.push('GOOGLE_PLAY_CERT_SHA256');
    if (!process.env.APPLE_TEAM_ID) missing.push('APPLE_TEAM_ID');
    if (!process.env.APPLE_BUNDLE_ID) missing.push('APPLE_BUNDLE_ID');
    if (!process.env.APP_ATTEST_ENVIRONMENT) missing.push('APP_ATTEST_ENVIRONMENT');
  }
  if (missing.length > 0) {
    return Response.json({ ready: false, missing }, { status: 503 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ ready: false, database: 'unconfigured' }, { status: 503 });
  const { error } = await service.from('seasons').select('id').limit(1);
  if (error) return Response.json({ ready: false, database: 'unreachable' }, { status: 503 });
  return Response.json({ ready: true });
}

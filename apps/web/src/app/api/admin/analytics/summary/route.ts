import { z } from 'zod';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { getAnalyticsSummary } from '@/lib/analytics-summary';

const daysSchema = z.coerce.number().int().min(1).max(90).default(30);

/**
 * Aggregated growth metrics for the admin dashboard. `analytics_events` has
 * NO user RLS policies (docs/analytics.md), so this is the only read path:
 * admin gate → service client → aggregates only, never raw event rows.
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = daysSchema.safeParse(new URL(req.url).searchParams.get('days') ?? undefined);
  if (!parsed.success) {
    return Response.json({ error: 'days must be an integer between 1 and 90' }, { status: 422 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const summary = await getAnalyticsSummary(service, parsed.data);
  return Response.json(summary);
}

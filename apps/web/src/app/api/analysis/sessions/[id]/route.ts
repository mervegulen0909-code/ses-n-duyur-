import { z } from 'zod';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return Response.json({ error: 'Invalid session id' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const { data } = await ctx.supabase
    .from('analysis_sessions')
    .select('id, performance_id, status, error_code, created_at, started_at, completed_at')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!data) return Response.json({ error: 'Analysis session not found' }, { status: 404 });
  return Response.json({ session: data });
}

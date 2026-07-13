import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

const inputSchema = z.object({ purpose: z.enum(['attestation', 'assertion']) });

/** Issue a five-minute, single-use challenge for iOS App Attest. */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });
  const challenge = randomBytes(32).toString('base64url');
  const { data, error } = await service
    .from('attestation_challenges')
    .insert({
      user_id: ctx.user.id,
      purpose: parsed.data.purpose,
      challenge,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) {
    return Response.json({ error: 'Could not issue attestation challenge' }, { status: 500 });
  }
  return Response.json({ challengeId: data.id, challenge });
}

import { z } from 'zod';
import { getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { registerIosAttestation } from '@/lib/native-attestation';

const inputSchema = z.object({
  challengeId: z.string().uuid(),
  keyId: z.string().min(20).max(256),
  attestation: z.string().min(20).max(32_000),
});

/** Verify and persist an iOS App Attest key for this user/device. */
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

  const ok = await registerIosAttestation({ userId: ctx.user.id, ...parsed.data });
  if (!ok) return Response.json({ error: 'App attestation failed' }, { status: 403 });
  return Response.json({ ok: true }, { status: 201 });
}

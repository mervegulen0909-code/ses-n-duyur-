import { rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';

/**
 * Permanently delete the authenticated user's account and everything they own.
 *
 * Store compliance: Apple Guideline 5.1.1(v) and Google Play both require any app
 * offering account creation to also offer in-app account deletion. This is the
 * server half of that flow — the mobile profile screen calls it after an
 * explicit, destructive confirmation.
 *
 * How the cascade works (see supabase/migrations/20260609120000_init.sql):
 * public.profiles(id) references auth.users(id) ON DELETE CASCADE, and every
 * user-owned table (performances → scores, verified_listens, criteria_ratings,
 * battle_votes, comments, admin_scores, and any battles referencing the user's
 * performances) references public.profiles(id) ON DELETE CASCADE. So deleting
 * the auth user removes ALL of it in a single call. Legally-retained rows are
 * preserved but de-identified: dmca_requests.performance_id and
 * moderation_flags.reporter_id are ON DELETE SET NULL, so a filing/report
 * survives, anonymized.
 *
 * Security: the user id comes ONLY from the verified session/JWT (getRequestContext),
 * never from the request body — there is no way to delete another user's account.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { user } = ctx;

  // rateLimit only — botGuard is deliberately OMITTED. Mobile cannot supply a
  // Turnstile token, and this is the store-required (Apple 5.1.1(v) / Google
  // Play) account-deletion flow: adding botGuard here would 403 every native
  // deletion and break store compliance. Do NOT add botGuard to this route.
  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  // Deleting an auth user requires the service role (admin API + RLS bypass).
  const service = createSupabaseServiceClient();
  if (!service) {
    console.error('[account/delete] service role unavailable — cannot delete account');
    return Response.json(
      { error: 'Account deletion is temporarily unavailable. Please try again later.' },
      { status: 503 },
    );
  }

  // Best-effort audit BEFORE the cascade. ratings_audit.actor has no FK, so this
  // de-identified "an account was deleted" record survives. Never block a user's
  // right-to-erasure on an audit write failing.
  const { error: auditError } = await service.from('ratings_audit').insert({
    actor: user.id,
    action: 'account_deleted',
    target: user.id,
  });
  if (auditError) {
    console.error('[account/delete] audit insert failed (continuing)', auditError);
  }

  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(`[account/delete] deleteUser failed for ${user.id}`, error);
    return Response.json({ error: 'Could not delete account' }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
}

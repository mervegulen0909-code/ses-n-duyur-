-- VoxScore — lock down the data-mutating SECURITY DEFINER RPC.
--
-- apply_battle_result() runs SECURITY DEFINER (it BYPASSES RLS) and rewrites
-- performances.elo_rating / battle_wins / battle_count. It is meant to be called
-- ONLY by the server via the service_role client
-- (apps/web/src/app/api/battles/vote/route.ts), AFTER the battle vote has been
-- inserted as the user and re-verified by RLS (both sides Verified-Listen'd).
--
-- Postgres grants EXECUTE on new public functions to PUBLIC by default, and
-- Supabase exposes every public-schema function as a PostgREST RPC reachable with
-- the anon key that ships to the browser. Left as-is, ANY anon/authenticated
-- caller could:
--     POST {SUPABASE_URL}/rest/v1/rpc/apply_battle_result
--     { "p_perf_a": "...", "p_perf_b": "...", "p_result_for_a": 1, "p_k": 1000000 }
-- and rewrite the leaderboard / Elo standings directly — bypassing the entire
-- verified-listen + battle-vote gate (Hard Rule 5) and never touching our API or
-- rate limiter. Revoke it from the client roles so only the server (service_role)
-- can invoke it. This is idempotent and safe to re-run.
--
-- NOTE: the other SECURITY DEFINER functions are intentionally left as-is —
-- is_admin() is called inside RLS policies (authenticated MUST retain EXECUTE and
-- it only ever returns the caller's own admin flag), and handle_new_user() /
-- guard_profile_privileges() are trigger functions (PostgREST does not expose
-- trigger-returning functions, and triggers fire regardless of EXECUTE grants).

revoke execute on function public.apply_battle_result(uuid, uuid, numeric, numeric)
  from public, anon, authenticated;

grant execute on function public.apply_battle_result(uuid, uuid, numeric, numeric)
  to service_role;

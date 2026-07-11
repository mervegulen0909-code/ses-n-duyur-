-- VoxScore — fresh-launch data reset.
--
-- ============================================================================
-- DO NOT RUN THIS AGAINST PRODUCTION WITHOUT THE USER'S EXPLICIT, INFORMED
-- CONSENT. This is a DESTRUCTIVE, IRREVERSIBLE bulk delete. No agent or script
-- should execute this automatically — the user runs it themselves, by hand,
-- in the Supabase SQL editor, after confirming they want a clean slate.
-- ============================================================================
--
-- Deletes every performance, vote, battle, and comment so the league can
-- relaunch with only the curated catalog (see scripts/seed-launch-catalog.ts).
-- Profiles/accounts, DMCA records, and ratings_audit are NEVER touched — legal
-- and account data must survive a content reset.
--
-- Most of these tables already cascade-delete from `performances` (see the FK
-- definitions in supabase/migrations/20260609120000_init.sql) — a single
-- `delete from performances` would remove scores, verified_listens,
-- criteria_ratings, battles, battle_votes, measured_scores, and comments on
-- its own. They are still deleted explicitly and in dependency order here so
-- the SQL editor reports a row count for each step — an operator running this
-- by hand can see exactly what was removed, not just trust an opaque cascade.
--
-- moderation_flags is deleted PERFORMANCE-SCOPED ONLY (target_type =
-- 'performance') — comment- and profile-scoped flags are unrelated to a
-- content reset and must survive.

begin;

delete from public.battle_votes;
delete from public.battles;
delete from public.criteria_ratings;
delete from public.verified_listens;
delete from public.measured_scores;
delete from public.comments;
delete from public.moderation_flags where target_type = 'performance';
delete from public.performance_requests;
delete from public.scores;
delete from public.performances;

-- ----------------------------------------------------------------------------
-- Songs: KEPT by default (commented out below). The catalog's song rows
-- (title/artist/category/difficulty/normalized_key) are reusable across
-- relaunches and the seed script re-links to them by normalized_key instead
-- of duplicating. Uncomment the two lines below ONLY if you also want to wipe
-- the song catalog itself (featured_challenges cascades from songs, so it
-- clears automatically when songs are deleted — no separate step needed).
-- ----------------------------------------------------------------------------
-- delete from public.featured_challenges;  -- redundant if songs are cleared (cascade) — explicit for clarity when songs are KEPT but challenges should still reset
-- delete from public.songs;

commit;

-- VoxScore — one YouTube video = one league entry (scoring-consistency audit).
--
-- performances.youtube_video_id had no uniqueness, so the SAME video could be
-- added twice (by the same or different users). Each insert triggers a fresh
-- LLM estimate, so the identical video could appear on the leaderboard with two
-- DIFFERENT AI scores — exactly the inconsistency the league must never show.
-- It also enables trivial leaderboard flooding with copies of a strong video.
--
-- A duplicate submit now fails the insert; the API maps the unique violation to
-- 409 "This video is already in the league." Also blocks re-adding a video that
-- was DMCA-removed (the removed row still holds the id) — desirable.
create unique index if not exists performances_youtube_video_unique
  on public.performances (youtube_video_id)
  where youtube_video_id is not null;

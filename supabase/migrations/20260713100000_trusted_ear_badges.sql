-- Trusted Ear badges (listener streak — viral-growth roadmap Phase D).
-- Same server-granted-only model as 20260711170000_badges.sql: catalog rows
-- here, grants only via the grant_badge() SECURITY DEFINER RPC from server
-- code (listens/complete route computes the streak from VALID verified
-- listens and grants speculatively — grant_badge is idempotent).

insert into public.badges (key, title, description, icon) values
  ('trusted_ear_bronze', 'Trusted Ear · Bronze', '3-day verified-listen streak.', '🥉'),
  ('trusted_ear_silver', 'Trusted Ear · Silver', '7-day verified-listen streak.', '🥈'),
  ('trusted_ear_gold',   'Trusted Ear · Gold',   '30-day verified-listen streak.', '🥇')
on conflict (key) do nothing;

-- Streak reads scan a user's recent VALID listens by day.
create index if not exists verified_listens_user_day_idx
  on public.verified_listens (user_id, created_at) where is_valid;

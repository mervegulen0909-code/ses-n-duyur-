-- Inviter badge (referral loop) — awarded by the auth callback when a user's
-- invite link has converted INVITER_BADGE_THRESHOLD signups (see
-- apps/web/src/lib/referral.ts). Same server-granted-only model as every
-- other badge: no user/admin write path, grant_badge() RPC only.

insert into public.badges (key, title, description, icon) values
  ('inviter', 'Inviter', 'Three friends joined VoxScore from your invite link.', '🤝')
on conflict (key) do nothing;

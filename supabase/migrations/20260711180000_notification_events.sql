-- Notifications, send side (growth §4.9/5 — design in
-- docs/growth-features-plan.md). The push REGISTRATION side already exists
-- (push_tokens, 20260613120000_push_tokens.sql); this adds the queue a
-- scheduled sender drains. No user policies for insert/update — rows are
-- written exclusively by server code paths via the service role, mirroring
-- analytics_events.

create table public.notification_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in (
    'battle_challenge', 'new_vote', 'rank_change', 'comment_reply',
    'performance_request_approved', 'performance_request_rejected'
  )),
  meta         jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notification_events_pending_idx on public.notification_events (user_id) where sent_at is null;

alter table public.notification_events enable row level security;
create policy notification_events_select_own on public.notification_events
  for select using (user_id = auth.uid());
-- Insert/update: service role only (written by the same server code paths
-- that already call trackServer(), e.g. after a vote/approval/rejection).

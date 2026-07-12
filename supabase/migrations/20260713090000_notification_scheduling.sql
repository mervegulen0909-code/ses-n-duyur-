-- D1 comeback push needs delayed delivery: the sender cron now drains only
-- rows whose scheduled_for has passed. Existing rows keep now() (immediate).
alter table public.notification_events
  add column scheduled_for timestamptz not null default now();
create index notification_events_due_idx
  on public.notification_events (scheduled_for)
  where sent_at is null;

-- New kind for the day-1 comeback push (queued at signup_completed, due 24h
-- later). The original check constraint enumerates kinds, so it must be
-- recreated to admit the new one.
alter table public.notification_events
  drop constraint notification_events_kind_check;
alter table public.notification_events
  add constraint notification_events_kind_check check (kind in (
    'battle_challenge', 'new_vote', 'rank_change', 'comment_reply',
    'performance_request_approved', 'performance_request_rejected',
    'day1_comeback'
  ));

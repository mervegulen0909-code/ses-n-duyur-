-- Weekly rotation queues a league-week-started push for every enrolled member.
-- The notification queue is service-role only; extend its kind constraint so
-- the cron can insert the new event without weakening client write access.
alter table public.notification_events
  drop constraint notification_events_kind_check;
alter table public.notification_events
  add constraint notification_events_kind_check check (kind in (
    'battle_challenge', 'new_vote', 'rank_change', 'comment_reply',
    'performance_request_approved', 'performance_request_rejected',
    'day1_comeback', 'league_week_started'
  ));

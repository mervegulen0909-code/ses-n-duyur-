-- Extend the analytics event catalog with the k-factor share funnel
-- (share_rendered -> challenge_link_visited -> guest_battle_started) and the
-- prediction-pool game event. Mirrors ANALYTICS_EVENTS in packages/core.

alter table public.analytics_events drop constraint if exists analytics_events_event_check;
alter table public.analytics_events add constraint analytics_events_event_check
  check (event in (
    'landing_view','signup_started','signup_completed',
    'performance_request_submitted','performance_request_approved',
    'verified_listen_completed','vote_submitted','battle_completed',
    'share_clicked','challenge_opened','invite_converted',
    'share_rendered','challenge_link_visited','guest_battle_started',
    'prediction_submitted'));

-- Durable push delivery queue.
-- Rows are claimed with SKIP LOCKED, transient failures back off and retry,
-- permanent failures become terminal, and concurrent cron invocations cannot
-- fan out the same event at the same time.

alter table public.notification_events
  add column delivery_status text not null default 'pending',
  add column attempt_count integer not null default 0,
  add column last_error text,
  add column next_attempt_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add constraint notification_events_delivery_status_check check (
    delivery_status in ('pending', 'processing', 'sent', 'no_tokens', 'dead_letter')
  ),
  add constraint notification_events_attempt_count_check check (attempt_count >= 0);

update public.notification_events
   set delivery_status = 'sent'
 where sent_at is not null;

drop index if exists notification_events_due_idx;
create index notification_events_delivery_due_idx
  on public.notification_events (next_attempt_at, scheduled_for, created_at)
  where sent_at is null
    and delivery_status in ('pending', 'processing');

create or replace function public.claim_notification_events(p_limit integer default 200)
returns table (
  id uuid,
  user_id uuid,
  kind text,
  meta jsonb,
  attempt_count integer
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select n.id
      from public.notification_events n
     where n.sent_at is null
       and n.scheduled_for <= now()
       and n.next_attempt_at <= now()
       and (
         n.delivery_status = 'pending'
         or (
           n.delivery_status = 'processing'
           and n.locked_at < now() - interval '5 minutes'
         )
       )
     order by n.created_at
     for update skip locked
     limit least(greatest(p_limit, 1), 500)
  )
  update public.notification_events n
     set delivery_status = 'processing',
         locked_at = now(),
         attempt_count = n.attempt_count + 1,
         last_error = null
    from candidates c
   where n.id = c.id
  returning n.id, n.user_id, n.kind, n.meta, n.attempt_count;
$$;

revoke execute on function public.claim_notification_events(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_events(integer)
  to service_role;

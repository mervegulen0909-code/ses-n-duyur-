-- Appeals (growth §4.9/4 — design in docs/growth-features-plan.md). Mirrors
-- performance_requests: a user submits, an admin decides, every decision is
-- logged. Appeals target a moderation action (a hidden performance, a
-- removed comment, a rejected performance request).

create table public.appeals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  target_type       text not null check (target_type in ('performance', 'comment', 'performance_request')),
  target_id         uuid not null,
  reason            text not null check (char_length(reason) between 10 and 2000),
  status            text not null default 'pending' check (status in ('pending', 'upheld', 'denied')),
  reviewer_id       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now()
);
create index appeals_status_idx on public.appeals (status);
create index appeals_user_idx on public.appeals (user_id);

alter table public.appeals enable row level security;
create policy appeals_insert_own on public.appeals
  for insert with check (user_id = auth.uid() and status = 'pending' and reviewer_id is null);
create policy appeals_select_own on public.appeals
  for select using (user_id = auth.uid());
create policy appeals_select_admin on public.appeals
  for select using (public.is_admin());
-- No user UPDATE policy — same pattern as performance_requests: only the
-- service role (via the admin API) can change status.

create table public.appeals_audit (
  id         uuid primary key default gen_random_uuid(),
  appeal_id  uuid not null references public.appeals (id) on delete cascade,
  actor      uuid references public.profiles (id) on delete set null,
  action     text not null check (action in ('submitted', 'upheld', 'denied')),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.appeals_audit enable row level security;
create policy appeals_audit_select_admin on public.appeals_audit
  for select using (public.is_admin());
-- Insert-only from the service role (written alongside every status change).

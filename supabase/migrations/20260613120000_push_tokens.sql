-- VocalLeague — push_tokens: one Expo push token per (user, device).
-- A user reads/writes ONLY their own tokens (RLS); the server (service_role)
-- reads all to fan out remote pushes via Expo's Push API. Backend contract is
-- documented in apps/mobile/src/lib/push.ts.

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null,                                -- Expo push token (ExponentPushToken[..])
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- Re-registering the same token bumps updated_at (reuses the shared trigger fn).
create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

-- A user sees and manages ONLY their own device tokens.
create policy push_tokens_select_own on public.push_tokens
  for select using (user_id = auth.uid());
create policy push_tokens_insert_self on public.push_tokens
  for insert with check (user_id = auth.uid());
create policy push_tokens_update_own on public.push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

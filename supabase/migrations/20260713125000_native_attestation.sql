-- Native application attestation state.
-- Challenges and device public keys are service-only. The API verifies Android
-- Play Integrity tokens per request and uses these rows for iOS App Attest's
-- one-time challenge + monotonically increasing assertion counter flow.

create table public.attestation_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  purpose     text not null check (purpose in ('attestation', 'assertion')),
  challenge   text not null check (char_length(challenge) between 22 and 256),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index attestation_challenges_active_idx
  on public.attestation_challenges (user_id, purpose, expires_at)
  where consumed_at is null;
alter table public.attestation_challenges enable row level security;
-- No client policies: challenges are issued and consumed by server routes.

create table public.native_attestations (
  key_id          text primary key check (char_length(key_id) between 20 and 256),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  platform        text not null check (platform = 'ios'),
  public_key_pem  text not null,
  receipt_base64  text not null,
  sign_count      bigint not null default 0 check (sign_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, key_id)
);
create index native_attestations_user_idx on public.native_attestations (user_id);
alter table public.native_attestations enable row level security;
-- No client policies: keys/counters are security state, service role only.

create or replace function public.advance_app_attest_counter(
  p_key_id text,
  p_user_id uuid,
  p_new_counter bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.native_attestations
     set sign_count = p_new_counter,
         updated_at = now()
   where key_id = p_key_id
     and user_id = p_user_id
     and p_new_counter > sign_count;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.advance_app_attest_counter(text, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.advance_app_attest_counter(text, uuid, bigint)
  to service_role;

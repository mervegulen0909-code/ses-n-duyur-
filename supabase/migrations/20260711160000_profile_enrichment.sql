-- Profile enrichment (growth §4.9/1 — design in docs/growth-features-plan.md).
-- Adds identity around the existing public profile view: bio, avatar, and up
-- to 5 external links (link count/shape validated by Zod, not SQL).

alter table public.profiles
  add column bio text check (bio is null or char_length(bio) <= 500),
  add column avatar_url text,
  add column links jsonb;

-- profiles_update_self (init.sql) already lets a user update their own row;
-- guard_profile_privileges (security_hardening.sql) only locks role/reputation
-- — bio/avatar_url/links need NO new table policy.

-- ----------------------------------------------------------------------------
-- Avatar storage: one public-read bucket, one folder per user
-- (avatars/<uid>/...), owner-write only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_select_all on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

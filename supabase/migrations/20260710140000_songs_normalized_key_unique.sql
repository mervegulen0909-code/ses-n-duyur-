-- VoxScore — one canonical row per song (same-song matchmaking).
--
-- performances now auto-link to a songs row via normalized_key (extracted from
-- the video title at add time). Two concurrent adds of covers of the SAME new
-- song must not create two song rows — that would split the matchmaking pool
-- and same-song battles would never pair them. The API upserts by this key and
-- retries on 23505, so the race resolves to a single winner.
create unique index if not exists songs_normalized_key_unique
  on public.songs (normalized_key)
  where normalized_key is not null;

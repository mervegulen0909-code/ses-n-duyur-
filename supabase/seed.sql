-- Local dev seed. Reference songs only — profiles/performances need real
-- auth.users, which are created through the Auth flow during development.
-- normalized_key must match packages/core/src/song.ts normalizeSongKey()
-- output ("artist :: title", cleaned) or a newly-approved performance for one
-- of these songs won't match this row and will fork a duplicate song instead.
insert into public.songs (title, artist, normalized_key) values
  ('Bohemian Rhapsody', 'Queen', 'queen :: bohemian rhapsody'),
  ('Someone Like You', 'Adele', 'adele :: someone like you'),
  ('Hallelujah', 'Leonard Cohen', 'leonard cohen :: hallelujah')
on conflict do nothing;

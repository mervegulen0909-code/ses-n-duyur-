-- Local dev seed. Reference songs only — profiles/performances need real
-- auth.users, which are created through the Auth flow during development.
insert into public.songs (title, artist, normalized_key) values
  ('Bohemian Rhapsody', 'Queen', 'bohemian-rhapsody-queen'),
  ('Someone Like You', 'Adele', 'someone-like-you-adele'),
  ('Hallelujah', 'Leonard Cohen', 'hallelujah-leonard-cohen')
on conflict do nothing;

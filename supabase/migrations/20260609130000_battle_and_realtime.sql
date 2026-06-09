-- Battle ratings on performances + Realtime broadcasting.

alter table public.performances
  add column elo_rating  numeric(8, 2) not null default 1500,
  add column battle_wins integer not null default 0,
  add column battle_count integer not null default 0;

-- Realtime: let clients subscribe to live score + performance changes.
-- Wrapped so a re-run (or a table already present) does not abort the migration.
do $$
begin
  alter publication supabase_realtime add table public.scores;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.performances;
exception when others then null;
end $$;

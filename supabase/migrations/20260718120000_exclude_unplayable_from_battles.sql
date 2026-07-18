-- Exclude battle videos that turn out to be unembeddable on real devices.
--
-- /api/battles/next already filters candidates through fetchEmbeddableVideoIds
-- (YouTube Data API `status.embeddable`), but that flag is imperfect: region,
-- age, or rights restrictions are NOT reflected in it, so some pairings still
-- fail to embed on device ("plays on YouTube only, can't verify here"). A
-- Verified Listen is then impossible for that side, leaving the whole battle
-- unvotable — the user can only skip it, and the same bad video keeps getting
-- paired for everyone.
--
-- Clients report the block; the server RE-VERIFIES via the Data API before
-- flagging here (a single report cannot exclude a genuinely embeddable video —
-- see /api/performances/report-unplayable), then the battle matcher skips it.

alter table public.performances
  add column if not exists embed_unplayable_at timestamptz;

-- The battle matcher filters `embed_unplayable_at is null`; a partial index
-- keeps that predicate cheap without bloating the common (null) case.
create index if not exists performances_embed_unplayable_idx
  on public.performances (embed_unplayable_at)
  where embed_unplayable_at is not null;

-- Server-managed: set ONLY by the service role after re-verification. Extend the
-- column guard (20260710120000) so a performance's owner can't set or clear it
-- via PostgREST to dodge or fake the exclusion. service_role / SQL migrations
-- have auth.uid() null and stay exempt; admins stay exempt via is_admin().
create or replace function public.guard_performance_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.elo_rating is distinct from old.elo_rating
       or new.battle_wins is distinct from old.battle_wins
       or new.battle_count is distinct from old.battle_count
       or new.youtube_video_id is distinct from old.youtube_video_id
       or new.oembed_meta is distinct from old.oembed_meta
       or new.source is distinct from old.source
       or new.embed_unplayable_at is distinct from old.embed_unplayable_at
       or new.user_id is distinct from old.user_id then
      raise exception
        'performance status, ratings, and video identity are server-managed';
    end if;
  end if;
  return new;
end;
$$;

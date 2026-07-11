# Catalog curation — the living library workflow

The song/performance catalog is a **living library**: it launched with a
38-performance pilot (19 songs × 2 covers) and is meant to grow toward
1000+ entries through repeated update passes, not one-off seeding.

## The standing rule

> **The most-viewed cover of a song is ALWAYS its primary scoring video.**

"Primary" means slot order in the template: `performances[0]` is seeded
first and anchors the song's entry. `scripts/curate-catalog.ts` enforces
this automatically by fetching view counts and sorting each song's
performances descending — never hand-order slots.

## Files

| File                                         | Role                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `supabase/seed/launch-catalog.template.json` | The catalog itself: songs + performance slots (+ enrichment)                               |
| `scripts/curate-catalog.ts`                  | Verify links (oEmbed), fetch view counts, sort most-viewed-first, report dead links        |
| `scripts/seed-launch-catalog.ts`             | Idempotent seeding into Supabase (duplicates skipped, scores stamped with the open season) |

## Workflow

### Adding songs / links

1. Add song entries (or fill `youtubeUrl: null` slots) in the template.
   Links must be real cover/performance videos — never the original
   artist's official video, never fabricated URLs. Verify candidates via
   oEmbed before adding (`https://www.youtube.com/oembed?url=<url>&format=json`).
2. Run `pnpm curate:catalog`. It will:
   - oEmbed-verify every filled slot (dead link → reported, exit 1)
   - fetch view counts and write `viewCount`/`oembedTitle`/`author`/`verifiedAt`
   - sort each song's slots most-viewed-first (primary = index 0)
3. Review the printed report (`PRIMARY <song>: <author> (<views>)` lines).
4. Seed: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm seed:launch-catalog`
   — idempotent; re-running only inserts videos not already in the league.
   **Production seeding requires explicit user consent every time.**
5. **Re-score with the real provider.** The seed script can only produce
   MOCK scores (metadata-hash noise — the env-gated OpenAI/Anthropic
   factories live in the web app, not in `@voxscore/core`), which is honest
   but meaningless for ranking. As an admin, call
   `POST /api/admin/rescore` (body `{"limit": 5}`) repeatedly until
   `remaining: 0` — it runs the deployed app's real provider against the
   same metadata and recomputes blends via the votes RPC. It refuses to
   overwrite anything if the real provider isn't configured.

### Library health pass (periodic)

Run `pnpm curate:catalog --check` — verifies every link and reports dead
ones without touching the file. Videos disappear/have embedding disabled
over time; a dead primary should be replaced (or its slot re-sorted so the
next-most-viewed cover becomes primary).

## View counts at scale

- **Preferred: YouTube Data API v3** — set `YOUTUBE_API_KEY` in the
  environment. Batched 50 ids/request (`videos.list?part=statistics`), so
  1000+ entries cost ~20 quota-cheap requests. This is the authoritative
  path; set it up before the library grows past the pilot.
- **Fallback (no key): watch-page metadata read** — best-effort, can return
  "unknown" (consent walls, layout changes). Unknown counts sort after
  known ones and are listed in the report; treat them as "needs API key",
  never as zero.

## Hard rules (same as everywhere else)

- Embed only — this pipeline touches **metadata only** (oEmbed JSON, public
  page JSON, Data API statistics). Never download/cache/analyze media.
- Seeded scores are deterministic mock estimates (`ai_provider: 'mock'`),
  honestly labeled provisional — same as any user-added performance.

# VoxScore Viral Growth Roadmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 10-feature viral-growth roadmap (P0 share loop → P1 retention → P2 growth multipliers) for VoxScore, in strict order, one branch/PR per phase.

**Architecture:** Every feature is built on the existing stack: pure logic in `packages/core` (fully unit-tested), Zod-validated API routes in `apps/web/src/app/api/**`, RLS-guarded Postgres migrations in `supabase/migrations/`, Server Components by default with small client islands, analytics via the existing `track()`/`trackServer()` pipeline. Nothing here touches YouTube media — embeds only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres+Auth+RLS), Zod, Vitest, next-intl (7 locales), Expo (mobile parity is explicitly out of scope except Task 6).

## Global Constraints (from CLAUDE.md — every task implicitly includes these)

- **NEVER** download, cache, store, or DSP-analyze YouTube audio/video. Embed only, official iframe API only.
- AI scores are always labeled "Provisional AI Estimate" (`Geçici YZ Tahmini`); never imply real audio measurement for embedded content.
- A user CANNOT vote until Verified Listen completes — enforced server-side. Battle winner pick requires BOTH listens verified. **Predictions (Phase E) are NOT votes** — they never touch Elo/scores and must be visually distinct from voting.
- RLS on EVERY new table. `service_role` key server-only. Zod-validate every API input. Never trust client-reported listen/vote data.
- Vitest with **100% line/function coverage gate** — every new file needs a colocated `.test.ts`. When a test asserts multi-line SQL file content, normalize CRLF first: `content.replace(/\r\n/g, '\n')` (Windows checkouts).
- i18n: every new user-facing string must be added to ALL SEVEN files: `apps/web/messages/{en,tr,zh,hi,es,fr,ar}.json`. English and Turkish strings are given verbatim in each task; translate the other five faithfully (no English fallback allowed).
- Vercel Hobby plan rejects sub-daily crons — new crons must be `0 0 * * *` (daily) and self-gate on weekday inside the handler.
- Small PRs: **one phase = one branch = one PR**, squash merge. Branch names given per phase. Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:migrate`.
- Commit messages end with: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Migration timestamps below start at `20260713090000` — if that date has passed when you implement, bump to the current date, keeping relative order.

**Existing helpers you must reuse (do not reinvent):**
- `getRequestContext(req)`, `createSupabaseServerClient()`, `createSupabaseServiceClient()` from `apps/web/src/lib/supabase/server.ts`
- `rateLimit(req, userId)` from `apps/web/src/lib/guard.ts`
- `track(event, meta)` client / `trackServer(service, event, userId, meta)` server
- `notifyServer(service, userId, kind, meta)` from `apps/web/src/lib/notify.ts`
- `grantBadge(service, userId, badgeKey)` from `apps/web/src/lib/badges.ts`
- `currentSeasonId(service)` from `apps/web/src/lib/seasons.ts`
- `YouTubePlayer` (`apps/web/src/components/youtube-player.tsx`) with `onStart`/`onComplete` callbacks
- Route-test mock harness (mirror `apps/web/src/app/api/analytics/route.test.ts`): `vi.mock('@/lib/supabase/server', ...)`, `vi.mock('@/lib/guard', ...)`, build a fake service with `vi.fn()` chains.

---

# PHASE A (P0-1) — Shareable Result Artifact ("Wordle line")
**Branch:** `feat/share-line` · **Evidence:** Wordle share-grid triggered its 90→2M growth; the artifact must be copy-paste text that works everywhere, generated at every result moment.

### Task 1: Pure share-line builder in core

**Files:**
- Create: `packages/core/src/share-line.ts`
- Create: `packages/core/src/share-line.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `scoreBar(score: number): string` and `buildShareLine(line: { headline: string; bar?: string; url: string }): string` — used by Tasks 3, 4, 6, and Phase B.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/share-line.test.ts
import { describe, expect, it } from 'vitest';
import { buildShareLine, scoreBar } from './share-line';

describe('scoreBar — 5-block emoji bar', () => {
  it('maps 0 to empty bar', () => {
    expect(scoreBar(0)).toBe('⬛⬛⬛⬛⬛');
  });
  it('maps 100 to full bar', () => {
    expect(scoreBar(100)).toBe('🟩🟩🟩🟩🟩');
  });
  it('rounds to nearest block (71.6 → 4 blocks)', () => {
    expect(scoreBar(71.6)).toBe('🟩🟩🟩🟩⬛');
  });
  it('clamps out-of-range input', () => {
    expect(scoreBar(120)).toBe('🟩🟩🟩🟩🟩');
    expect(scoreBar(-5)).toBe('⬛⬛⬛⬛⬛');
  });
});

describe('buildShareLine — copy-paste artifact', () => {
  it('joins headline, bar, url with newlines', () => {
    expect(
      buildShareLine({ headline: 'H', bar: '🟩⬛', url: 'https://voxscore.app/x' }),
    ).toBe('H\n🟩⬛\nhttps://voxscore.app/x');
  });
  it('omits the bar line when not provided', () => {
    expect(buildShareLine({ headline: 'H', url: 'https://voxscore.app/x' })).toBe(
      'H\nhttps://voxscore.app/x',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/share-line.test.ts`
Expected: FAIL — `Cannot find module './share-line'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/share-line.ts
/**
 * The copy-paste share artifact (Wordle pattern): a short, spoiler-free,
 * platform-agnostic text block a user pastes anywhere. The headline is
 * caller-localized; this module owns only the stable FORMAT so every
 * surface (web result, battle, challenge, mobile) emits the same shape.
 */

/** 0–100 score → five-block emoji bar, rounded to the nearest block. */
export function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return '🟩'.repeat(filled) + '⬛'.repeat(5 - filled);
}

export interface ShareLine {
  /** Localized first line, e.g. "🎤 VoxScore 71.6 — Bohemian Rhapsody". */
  headline: string;
  /** Optional scoreBar() output. */
  bar?: string;
  /** Absolute URL back into the product — the invite. */
  url: string;
}

export function buildShareLine(line: ShareLine): string {
  return [line.headline, line.bar, line.url].filter(Boolean).join('\n');
}
```

Add to `packages/core/src/index.ts` (append alongside existing exports):

```ts
export { buildShareLine, scoreBar, type ShareLine } from './share-line';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/share-line.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/share-line.ts packages/core/src/share-line.test.ts packages/core/src/index.ts
git commit -m "feat(core): share-line builder — the copy-paste result artifact"
```

### Task 2: New analytics events for the k-factor funnel

**Files:**
- Modify: `packages/core/src/schemas.ts` (the `ANALYTICS_EVENTS` array, around line 196)

**Interfaces:**
- Produces: four new members of the `AnalyticsEvent` union: `'share_rendered' | 'challenge_link_visited' | 'guest_battle_started' | 'prediction_submitted'` — consumed by Tasks 3, 5, 8, 9, 16.

- [ ] **Step 1: Extend the enum** — in `packages/core/src/schemas.ts`, change the `ANALYTICS_EVENTS` array to:

```ts
export const ANALYTICS_EVENTS = [
  'landing_view',
  'signup_started',
  'signup_completed',
  'performance_request_submitted',
  'performance_request_approved',
  'verified_listen_completed',
  'vote_submitted',
  'battle_completed',
  'share_clicked',
  'challenge_opened',
  'invite_converted',
  // k-factor funnel: artifact shown → link visited → guest engaged.
  'share_rendered',
  'challenge_link_visited',
  'guest_battle_started',
  // Prediction pools (listener game — NOT a vote).
  'prediction_submitted',
] as const;
```

- [ ] **Step 2: Run the full suite** — an exhaustive-enum test elsewhere may reference the list.

Run: `pnpm test`
Expected: PASS. If a test asserts the exact event list, update its expectation to include the four new members.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/schemas.ts
git commit -m "feat(analytics): k-factor funnel events (share_rendered, challenge_link_visited, guest_battle_started, prediction_submitted)"
```

### Task 3: `ResultShare` client component (web)

**Files:**
- Create: `apps/web/src/components/result-share.tsx`
- Modify: `apps/web/messages/en.json`, `tr.json` (+ translate into `zh,hi,es,fr,ar`)

**Interfaces:**
- Consumes: `buildShareLine`, `scoreBar` from `@voxscore/core`; `track` from `@/lib/analytics`.
- Produces: `<ResultShare headline={string} score={number | null} url={string} context={string} />` — mounted by Tasks 4 and 5.

- [ ] **Step 1: Add i18n keys.** In `apps/web/messages/en.json` under the existing `"Common"` object add:

```json
"copyResultLine": "Copy result",
"resultCopied": "Copied — paste it anywhere",
"shareOnWhatsApp": "WhatsApp",
"shareOnX": "X"
```

In `apps/web/messages/tr.json` under `"Common"`:

```json
"copyResultLine": "Sonucu kopyala",
"resultCopied": "Kopyalandı — istediğin yere yapıştır",
"shareOnWhatsApp": "WhatsApp",
"shareOnX": "X"
```

Add faithful translations of the same four keys to `zh.json`, `hi.json`, `es.json`, `fr.json`, `ar.json`.

- [ ] **Step 2: Write the component**

```tsx
// apps/web/src/components/result-share.tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { buildShareLine, scoreBar } from '@voxscore/core';
import { track } from '@/lib/analytics';

/**
 * The share moment: shown immediately after a result (score reveal, battle
 * vote). Renders a one-tap copy of the Wordle-style text artifact plus
 * WhatsApp/X intents carrying the same text. Fires share_rendered once on
 * mount and share_clicked per channel — the two ends of the k-factor funnel.
 */
export function ResultShare({
  headline,
  score,
  url,
  context,
}: {
  headline: string;
  score: number | null;
  url: string;
  context: string; // e.g. 'battle_result' | 'performance_score' — analytics meta only
}) {
  const t = useTranslations('Common');
  const [copied, setCopied] = useState(false);
  const line = buildShareLine({
    headline,
    bar: score === null ? undefined : scoreBar(score),
    url,
  });

  useEffect(() => {
    track('share_rendered', { context });
  }, [context]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      track('share_clicked', { context, channel: 'copy_line' });
    } catch {
      // Clipboard can be unavailable (permissions); the intents still work.
    }
  }

  const encoded = encodeURIComponent(line);
  const btn =
    'rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500';

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={onCopy} className={btn}>
        {copied ? t('resultCopied') : t('copyResultLine')}
      </button>
      <a
        href={`https://wa.me/?text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className={btn}
        onClick={() => track('share_clicked', { context, channel: 'whatsapp' })}
      >
        {t('shareOnWhatsApp')}
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className={btn}
        onClick={() => track('share_clicked', { context, channel: 'x' })}
      >
        {t('shareOnX')}
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm lint`. Expected: clean. (Client components are exercised by the E2E/coverage config the same way existing `share-buttons.tsx` is — if the coverage gate complains about the new file, colocate a smoke test that renders the JSX with `@testing-library/react` following any existing component test in the repo; if no component-test harness exists, coverage for `src/components` is excluded — check `vitest.config` `coverage.include` before writing one.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/result-share.tsx apps/web/messages/*.json
git commit -m "feat(web): ResultShare — one-tap Wordle-style result artifact"
```

### Task 4: Mount ResultShare at both result moments

**Files:**
- Modify: `apps/web/src/components/battle-arena.tsx` (the `voteState === 'ok'` block, ~line 107)
- Modify: `apps/web/src/app/performance/[id]/page.tsx` (below the ScoreBreakdown sidebar)
- Modify: `apps/web/messages/en.json`, `tr.json` (+5 translations)

**Interfaces:**
- Consumes: `<ResultShare>` from Task 3.

- [ ] **Step 1: i18n.** `en.json`, new keys inside `"Battle"`: `"shareResult": "Share your verdict"`; and inside `"Performance"`: `"shareScore": "Share this score"`. `tr.json`: `"shareResult": "Kararını paylaş"`, `"shareScore": "Bu skoru paylaş"`. Translate into the other five files.

- [ ] **Step 2: Battle arena.** In `battle-arena.tsx`, import `{ ResultShare }` and extend the success block:

```tsx
{voteState === 'ok' ? (
  <div className="space-y-3 text-center">
    <p className="text-emerald-400">{result}</p>
    <p className="text-sm text-neutral-400">{t('Battle.shareResult')}</p>
    <ResultShare
      headline={`⚔️ VoxScore — ${battle.a.title} vs ${battle.b.title}`}
      score={null}
      url={`https://voxscore.app/battle`}
      context="battle_result"
    />
    <button
      type="button"
      onClick={onDone}
      className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
    >
      {t('Battle.nextBattle')}
    </button>
  </div>
) : (
```

- [ ] **Step 3: Performance page.** In `performance/[id]/page.tsx` (Server Component), after the existing share section, add — using the already-fetched `perf`/`score` rows and existing `oembed_meta` title extraction on that page:

```tsx
<ResultShare
  headline={`🎤 VoxScore ${score?.current_score?.toFixed(1) ?? '—'} — ${title}`}
  score={score?.current_score ?? null}
  url={`https://voxscore.app/performance/${perf.id}`}
  context="performance_score"
/>
```

(`title` is whatever local variable that page already derives from `oembed_meta` — reuse it, do not re-derive.)

- [ ] **Step 4: Verify in browser.** `pnpm dev`, open a performance page and a battle; confirm the copy button puts the 3-line artifact on the clipboard and `POST /api/analytics` fires `share_rendered`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/battle-arena.tsx "apps/web/src/app/performance/[id]/page.tsx" apps/web/messages/*.json
git commit -m "feat(web): mount ResultShare at battle and score result moments"
```

### Task 5: Phase A finish — full gate + PR

- [ ] Run: `pnpm typecheck && pnpm lint && pnpm test` — all green, coverage 100%.
- [ ] `git push -u origin feat/share-line`, open PR titled `feat: shareable result artifact (Wordle line)`, squash-merge after CI `verify` passes. (The `Vercel` check from `mervegulen0909-codes-projects` is known-broken/unrelated — ignore it; `verify` is the gate.)

### Task 6: Mobile share parity (small, same branch or follow-up `feat/share-line-mobile`)

**Files:**
- Modify: `apps/mobile/src/app/performance/[id].tsx`

- [ ] **Step 1:** Import `{ buildShareLine, scoreBar }` from `@voxscore/core` and React Native's `Share`. Below the score panel add a "Sonucu paylaş" button (reuse the screen's existing i18n mechanism — mobile has its own translations; add the key to every mobile locale file the screen already uses):

```tsx
import { Share } from 'react-native';
// inside the component, score & title already exist on this screen:
async function onShare() {
  await Share.share({
    message: buildShareLine({
      headline: `🎤 VoxScore ${score?.toFixed(1) ?? '—'} — ${title}`,
      bar: score == null ? undefined : scoreBar(score),
      url: `https://voxscore.app/performance/${id}`,
    }),
  });
}
```

- [ ] **Step 2:** `pnpm --filter @voxscore/mobile typecheck && pnpm --filter @voxscore/mobile lint`, then verify via `npx expo export --platform web` (must bundle clean). Commit: `feat(mobile): native share of the result line`.

---

# PHASE B (P0-2) — Open Challenge Links (guest-viewable)
**Branch:** `feat/open-challenge` · **Evidence:** TikTok "open verse" asymmetric respond-to-a-prompt loop; the landing must work BEFORE signup.

### Task 7: `safeInternalPath` — login `next=` redirect support

**Files:**
- Create: `apps/web/src/lib/safe-path.ts`
- Create: `apps/web/src/lib/safe-path.test.ts`
- Modify: `apps/web/src/app/login/page.tsx`

**Interfaces:**
- Produces: `safeInternalPath(raw: string | null): string` — returns `raw` only if it is a same-origin relative path, else `'/'`. Consumed by login page and Task 8's guest CTA.

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/lib/safe-path.test.ts
import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-path';

describe('safeInternalPath — open-redirect guard', () => {
  it('accepts a plain internal path', () => {
    expect(safeInternalPath('/song/abc?challenge=1')).toBe('/song/abc?challenge=1');
  });
  it.each(['//evil.com', 'https://evil.com', 'javascript:alert(1)', '', null])(
    'rejects %s',
    (raw) => {
      expect(safeInternalPath(raw as string | null)).toBe('/');
    },
  );
});
```

- [ ] **Step 2:** Run `pnpm vitest run apps/web/src/lib/safe-path.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implementation**

```ts
// apps/web/src/lib/safe-path.ts
/**
 * Open-redirect guard for ?next= params: only a same-origin RELATIVE path
 * survives ('/x...'), everything else falls back to home. '//host' is a
 * protocol-relative absolute URL — rejected.
 */
export function safeInternalPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}
```

- [ ] **Step 4:** Test passes. In `login/page.tsx`, replace the post-auth `router.push('/')` with:

```ts
import { safeInternalPath } from '@/lib/safe-path';
// in onSubmit success path:
router.push(safeInternalPath(new URLSearchParams(window.location.search).get('next')));
```

(Google OAuth continues to land on `/auth/callback` → home; carrying `next` through OAuth is explicitly out of scope.)

- [ ] **Step 5:** `pnpm test && pnpm typecheck`, then commit: `feat(web): login honors a safe ?next= return path`.

### Task 8: `GuestBattle` component — listen-gated preview without an account

**Files:**
- Create: `apps/web/src/components/guest-battle.tsx`
- Modify: `apps/web/messages/en.json`, `tr.json` (+5)

**Interfaces:**
- Consumes: `YouTubePlayer` (existing), `track`, `safeInternalPath` semantics via a `loginNext` prop.
- Produces: `<GuestBattle a={Side} b={Side} loginNext={string} entry={string} />` where `Side = { videoId: string; title: string }`. Consumed by Tasks 9 and 10. **No server writes ever happen here** — the guest gate is a local UX teaser; real verified listens/votes start only after login.

- [ ] **Step 1: i18n.** `en.json`, new top-level-section keys under `"Battle"`:

```json
"guestWatchBoth": "Watch both fully to pick a winner",
"guestPickCta": "Pick the winner — create your free account",
"guestListened": "Watched ✓"
```

`tr.json`:

```json
"guestWatchBoth": "Kazananı seçmek için ikisini de sonuna kadar izle",
"guestPickCta": "Kazananı seç — ücretsiz hesabını aç",
"guestListened": "İzlendi ✓"
```

(+5 translations.)

- [ ] **Step 2: Component**

```tsx
// apps/web/src/components/guest-battle.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import { YouTubePlayer } from './youtube-player';

interface Side {
  videoId: string;
  title: string;
}

/**
 * The signup-free battle teaser (onboarding <60s + challenge landing).
 * Both players must reach ENDED before the winner buttons route to login.
 * This is a local teaser only — no listen sessions, no votes, no writes;
 * hard rules 4/5 stay enforced server-side for the real flow after login.
 */
export function GuestBattle({
  a,
  b,
  loginNext,
  entry,
}: {
  a: Side;
  b: Side;
  loginNext: string;
  entry: string; // analytics meta: 'home' | 'challenge'
}) {
  const router = useRouter();
  const t = useTranslations('Battle');
  const [doneA, setDoneA] = useState(false);
  const [doneB, setDoneB] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (entry === 'challenge') track('challenge_link_visited', { entry });
  }, [entry]);

  function onFirstStart() {
    if (startedRef.current) return;
    startedRef.current = true;
    track('guest_battle_started', { entry });
  }

  const both = doneA && doneB;
  const toLogin = () => router.push(`/login?next=${encodeURIComponent(loginNext)}`);

  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { side: a, done: doneA, setDone: setDoneA },
          { side: b, done: doneB, setDone: setDoneB },
        ].map(({ side, done, setDone }) => (
          <div key={side.videoId} className="space-y-2">
            <h3 className="truncate text-sm font-semibold">{side.title}</h3>
            <YouTubePlayer
              videoId={side.videoId}
              onStart={onFirstStart}
              onComplete={() => setDone(true)}
            />
            <p className={`text-xs ${done ? 'text-emerald-400' : 'text-neutral-500'}`}>
              {done ? t('guestListened') : t('guestWatchBoth')}
            </p>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!both}
        onClick={toLogin}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {t('guestPickCta')}
      </button>
    </div>
  );
}
```

- [ ] **Step 3:** `pnpm typecheck && pnpm lint`, commit: `feat(web): GuestBattle — signup-free listen-gated battle teaser`.

### Task 9: Challenge landing serves guests

**Files:**
- Modify: `apps/web/src/app/song/[id]/page.tsx`
- Modify: `apps/web/src/components/challenge-section.tsx`

**Interfaces:**
- Consumes: `GuestBattle` (Task 8). The song page is a Server Component that already fetches the song's ranked performances and current user.

- [ ] **Step 1:** In `song/[id]/page.tsx`, where `ChallengeSection` is rendered (when `searchParams.challenge` is present): pass the top two ranked performances (already fetched for the ranking list — reuse those rows' `youtube_video_id` and title) as a new prop:

```tsx
<ChallengeSection
  songId={song.id}
  isSignedIn={!!user}
  guestPair={
    rows.length >= 2
      ? {
          a: { videoId: rows[0]!.youtube_video_id!, title: titleOf(rows[0]!.oembed_meta) },
          b: { videoId: rows[1]!.youtube_video_id!, title: titleOf(rows[1]!.oembed_meta) },
        }
      : null
  }
/>
```

(`rows` / `titleOf` = the page's existing ranking variables; match the actual local names when editing.)

- [ ] **Step 2:** In `challenge-section.tsx`, replace the signed-out sign-in-prompt branch: accept the new optional prop `guestPair: { a: Side; b: Side } | null` and when `!isSignedIn && guestPair` render:

```tsx
<GuestBattle
  a={guestPair.a}
  b={guestPair.b}
  loginNext={`/song/${songId}?challenge=1`}
  entry="challenge"
/>
```

Keep the old sign-in prompt as the fallback when `guestPair` is null.

- [ ] **Step 3:** Manual check: open `/song/<id>?challenge=1` in a private window — both embeds render, buttons unlock only after both videos END, CTA routes to `/login?next=...` and login returns you to the challenge.

- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint`, commit: `feat(web): challenge landing works before signup`, push branch, PR `feat: open challenge links`, squash-merge on green `verify`.

---

# PHASE C (P0-3) — Onboarding <60s + D1 push
**Branch:** `feat/onboarding-60s` · **Evidence:** first-session time-to-value <60s and an intent-tied Day-1 push are the top D1 levers (industry medians D1 ~25-26%).

### Task 10: Guest battle on the signed-out home page

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/messages/en.json`, `tr.json` (+5)

- [ ] **Step 1: i18n.** `"Home"` section — en: `"tryNow": "Try it now — watch a battle, no account needed"`; tr: `"tryNow": "Hemen dene — hesapsız bir düello izle"` (+5).

- [ ] **Step 2:** `page.tsx` is a Server Component. When there is no signed-in user, fetch the most-battled song's top two performances and render `GuestBattle`:

```tsx
// inside the async component, after existing data fetching; supabase = anon server client
let guestPair: { a: Side; b: Side } | null = null;
if (!user) {
  const { data: topBattleSong } = await supabase
    .from('battles')
    .select('song_id')
    .not('song_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  const counts = new Map<string, number>();
  for (const b of topBattleSong ?? [])
    if (b.song_id) counts.set(b.song_id, (counts.get(b.song_id) ?? 0) + 1);
  const songId = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  if (songId) {
    const { data: perfs } = await supabase
      .from('performances')
      .select('youtube_video_id, oembed_meta')
      .eq('song_id', songId)
      .eq('status', 'active')
      .not('youtube_video_id', 'is', null)
      .limit(2);
    if (perfs && perfs.length === 2) {
      const titleOf = (m: unknown) => ((m ?? {}) as { title?: string }).title ?? 'Performance';
      guestPair = {
        a: { videoId: perfs[0]!.youtube_video_id!, title: titleOf(perfs[0]!.oembed_meta) },
        b: { videoId: perfs[1]!.youtube_video_id!, title: titleOf(perfs[1]!.oembed_meta) },
      };
    }
  }
}
// in JSX, above the category grid, when guestPair:
{guestPair && (
  <section className="w-full max-w-3xl">
    <h2 className="mb-3 text-lg font-semibold">{t('Home.tryNow')}</h2>
    <GuestBattle a={guestPair.a} b={guestPair.b} loginNext="/battle" entry="home" />
  </section>
)}
```

- [ ] **Step 3:** Verify: private window on `/` shows the teaser; both-ended unlock; CTA → login → `/battle`. Commit: `feat(web): signup-free battle teaser on the landing page`.

### Task 11: Scheduled notifications + Day-1 comeback push

**Files:**
- Create: `supabase/migrations/20260713090000_notification_scheduling.sql`
- Modify: `packages/core/src/schemas.ts` (NotificationKind union/const — find `NotificationKind` and add `'day1_comeback'`)
- Modify: `apps/web/src/lib/notify.ts`
- Modify: `apps/web/src/app/api/cron/send-notifications/route.ts` (the drain query)
- Modify: `apps/web/src/app/api/analytics/route.ts` (the signup hook)
- Test: extend `apps/web/src/lib/notify.test.ts` and `apps/web/src/app/api/analytics/route.test.ts`

**Interfaces:**
- Produces: `notifyServer(service, userId, kind, meta?, opts?: { scheduledFor?: string })` — backward compatible (opts optional). New notification kind `'day1_comeback'`.

- [ ] **Step 1: Migration**

```sql
-- 20260713090000_notification_scheduling.sql
-- D1 comeback push needs delayed delivery: the sender cron now drains only
-- rows whose scheduled_for has passed. Existing rows keep now() (immediate).
alter table public.notification_events
  add column scheduled_for timestamptz not null default now();
create index notification_events_due_idx
  on public.notification_events (scheduled_for)
  where sent_at is null;
```

- [ ] **Step 2:** `notify.ts` — add the optional opts param and include it in the insert:

```ts
export async function notifyServer(
  service: ServiceClient,
  userId: string,
  kind: NotificationKind,
  meta?: Record<string, string | number>,
  opts?: { scheduledFor?: string },
): Promise<void> {
  try {
    await service.from('notification_events').insert({
      user_id: userId,
      kind,
      meta: (meta ?? null) as unknown as Json | null,
      ...(opts?.scheduledFor ? { scheduled_for: opts.scheduledFor } : {}),
    });
  } catch {
    /* best-effort */
  }
}
```

Extend `notify.test.ts` with one case asserting `scheduled_for` is passed through, one asserting it is omitted by default.

- [ ] **Step 3:** Sender cron — in `send-notifications/route.ts`, add `.lte('scheduled_for', new Date().toISOString())` to the existing `sent_at is null` select chain.

- [ ] **Step 4:** Signup hook — in `api/analytics/route.ts`, after the event insert succeeds, add:

```ts
if (parsed.data.event === 'signup_completed' && ctx?.user) {
  await notifyServer(
    service,
    ctx.user.id,
    'day1_comeback',
    {},
    { scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
  );
}
```

Add `'day1_comeback'` to the `NotificationKind` source in `packages/core/src/schemas.ts`, and give it copy where notification kinds map to push text (grep `NotificationKind` usages — the Expo sender maps kind→title/body; en: "Your league is waiting — today's battles are live", tr: "Ligin seni bekliyor — bugünün düelloları başladı").

- [ ] **Step 5:** Route test — extend `analytics/route.test.ts`: mock `@/lib/notify`, assert `notifyServer` called with `'day1_comeback'` and a `scheduledFor` ~24h ahead when event is `signup_completed` with a user, and NOT called for anonymous or other events.

- [ ] **Step 6:** `pnpm db:migrate` locally (supabase running), `pnpm test && pnpm typecheck && pnpm lint`. Commit: `feat(retention): scheduled notifications + day-1 comeback push`. Push, PR `feat: onboarding under 60s + D1 push`, squash-merge. **Ops note in PR body:** run the migration on prod (`supabase db push` from the linked project) before deploy.

---

# PHASE D (P1-1) — Listener Streak + "Trusted Ear" identity
**Branch:** `feat/listener-streak` · **Evidence:** streaks retain only when tied to identity; Duolingo: >half of DAU holds a 7+ day streak.

### Task 12: Pure streak math in core

**Files:**
- Create: `packages/core/src/streak.ts`, `packages/core/src/streak.test.ts`; export from `packages/core/src/index.ts`.

**Interfaces:**
- Produces: `computeStreak(utcDates: string[], today: string): number` (dates as `'YYYY-MM-DD'`, unordered, may contain duplicates; streak = consecutive days ending today or yesterday) and `streakTier(streak: number): 'none' | 'bronze' | 'silver' | 'gold'` (bronze ≥3, silver ≥7, gold ≥30).

- [ ] **Step 1: Failing tests**

```ts
// packages/core/src/streak.test.ts
import { describe, expect, it } from 'vitest';
import { computeStreak, streakTier } from './streak';

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-07-10', '2026-07-11', '2026-07-12'], '2026-07-12')).toBe(3);
  });
  it('still alive if last listen was yesterday', () => {
    expect(computeStreak(['2026-07-10', '2026-07-11'], '2026-07-12')).toBe(2);
  });
  it('dies after a gap', () => {
    expect(computeStreak(['2026-07-09', '2026-07-10'], '2026-07-12')).toBe(0);
  });
  it('dedupes same-day listens and ignores order', () => {
    expect(
      computeStreak(['2026-07-12', '2026-07-11', '2026-07-12', '2026-07-11'], '2026-07-12'),
    ).toBe(2);
  });
  it('empty input → 0', () => {
    expect(computeStreak([], '2026-07-12')).toBe(0);
  });
});

describe('streakTier', () => {
  it.each([
    [0, 'none'],
    [2, 'none'],
    [3, 'bronze'],
    [6, 'bronze'],
    [7, 'silver'],
    [29, 'silver'],
    [30, 'gold'],
  ] as const)('%d → %s', (n, tier) => {
    expect(streakTier(n)).toBe(tier);
  });
});
```

- [ ] **Step 2:** FAIL run, then implement:

```ts
// packages/core/src/streak.ts
/**
 * Listener streak: consecutive UTC days with ≥1 VALID verified listen.
 * A streak is alive if its last day is today or yesterday (grace until the
 * day actually ends). Pure — callers supply distinct 'YYYY-MM-DD' strings.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function computeStreak(utcDates: string[], today: string): number {
  const days = new Set(utcDates);
  const t = Date.parse(`${today}T00:00:00Z`);
  let cursor = days.has(today) ? t : t - DAY_MS;
  if (!days.has(new Date(cursor).toISOString().slice(0, 10))) return 0;
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export type StreakTier = 'none' | 'bronze' | 'silver' | 'gold';

export function streakTier(streak: number): StreakTier {
  if (streak >= 30) return 'gold';
  if (streak >= 7) return 'silver';
  if (streak >= 3) return 'bronze';
  return 'none';
}
```

- [ ] **Step 3:** PASS run; export from index; commit `feat(core): listener streak math`.

### Task 13: Badge catalog + grant on listen completion

**Files:**
- Create: `supabase/migrations/20260713100000_trusted_ear_badges.sql`
- Modify: `apps/web/src/lib/badges.ts` (BadgeKey union)
- Create: `apps/web/src/lib/streak-server.ts` + `streak-server.test.ts`
- Modify: `apps/web/src/app/api/listens/complete/route.ts` (+ its route.test.ts)

**Interfaces:**
- Produces: `currentListenStreak(service, userId, today): Promise<number>`; badge keys `'trusted_ear_bronze' | 'trusted_ear_silver' | 'trusted_ear_gold'`.

- [ ] **Step 1: Migration** — mirror the insert style of `20260711170000_badges.sql` (badge catalog rows; check that file for exact column names before writing):

```sql
-- 20260713100000_trusted_ear_badges.sql
insert into public.badges (key, title, description) values
  ('trusted_ear_bronze', 'Trusted Ear · Bronze', '3-day verified-listen streak'),
  ('trusted_ear_silver', 'Trusted Ear · Silver', '7-day verified-listen streak'),
  ('trusted_ear_gold',   'Trusted Ear · Gold',   '30-day verified-listen streak')
on conflict (key) do nothing;
create index if not exists verified_listens_user_day_idx
  on public.verified_listens (user_id, created_at) where is_valid;
```

(If the badges table columns differ — e.g. `name` instead of `title` — copy the existing migration's column list exactly.)

- [ ] **Step 2:** `badges.ts`: extend `BadgeKey` with the three new literals.

- [ ] **Step 3:** `streak-server.ts`:

```ts
import 'server-only';
import { computeStreak } from '@voxscore/core';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** Current verified-listen streak, computed from the last 60 days of rows. */
export async function currentListenStreak(
  service: ServiceClient,
  userId: string,
  today: string,
): Promise<number> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86400000).toISOString();
  const { data } = await service
    .from('verified_listens')
    .select('created_at')
    .eq('user_id', userId)
    .eq('is_valid', true)
    .gte('created_at', since);
  return computeStreak((data ?? []).map((r) => r.created_at.slice(0, 10)), today);
}
```

Test with a mocked service returning fixed rows (mirror `badges.test.ts` service-mock style): asserts date-slicing + delegation (3 consecutive days → 3).

- [ ] **Step 4:** In `listens/complete/route.ts`, inside the existing `if (result.isValid)` block (where `trackServer` already fires), add:

```ts
const today = new Date().toISOString().slice(0, 10);
const streak = await currentListenStreak(service, user.id, today);
const tier = streakTier(streak);
if (tier === 'bronze') await grantBadge(service, user.id, 'trusted_ear_bronze');
if (tier === 'silver') await grantBadge(service, user.id, 'trusted_ear_silver');
if (tier === 'gold') await grantBadge(service, user.id, 'trusted_ear_gold');
```

(grantBadge is idempotent — speculative granting is the established pattern.) Extend the route test: valid listen with a mocked 7-day streak grants silver.

- [ ] **Step 5:** Profile display — in `apps/web/src/app/profile/[handle]/page.tsx`, badges already render from `profile_badges`; nothing to add beyond i18n names. Add badge title keys to all 7 message files under `"Profile"`: en `"trustedEarBronze": "Trusted Ear · Bronze"` etc., tr `"trustedEarBronze": "Güvenilir Kulak · Bronz"`, `"trustedEarSilver": "Güvenilir Kulak · Gümüş"`, `"trustedEarGold": "Güvenilir Kulak · Altın"` — wire them wherever the existing badge-key→label mapping lives (grep `first_performance` in `apps/web/src` to find it).

- [ ] **Step 6:** Full gate, commit `feat(retention): Trusted Ear listener streak badges`, PR, merge. **Ops:** prod migration required.

---

# PHASE E (P1-2) — Prediction Pools (the listener game)
**Branch:** `feat/prediction-pools` · **Evidence:** DraftKings-style meta layer converts solo consumption into a community ritual; gives the non-singing 99% a daily game. **Predictions are not votes** — no listen gate, no Elo impact, separate table.

### Task 14: Schema + scoring RPC

**Files:**
- Create: `supabase/migrations/20260713110000_battle_predictions.sql`

```sql
-- 20260713110000_battle_predictions.sql
-- Prediction pools: listeners pick a winner BEFORE a battle closes. This is
-- a game layer — completely separate from battle_votes (hard rules 4/5).
create table public.battle_predictions (
  id           uuid primary key default gen_random_uuid(),
  battle_id    uuid not null references public.battles (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  predicted    uuid not null references public.performances (id) on delete cascade,
  is_correct   boolean,
  created_at   timestamptz not null default now(),
  unique (battle_id, user_id)
);
alter table public.battle_predictions enable row level security;

-- Insert your own prediction, only while the battle is still open, and only
-- for one of the two fighters.
create policy battle_predictions_insert_own on public.battle_predictions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.battles b
      where b.id = battle_id
        and b.status = 'open'
        and predicted in (b.perf_a, b.perf_b)
    )
  );
create policy battle_predictions_select_own on public.battle_predictions
  for select using (user_id = auth.uid());
-- No user update/delete: predictions are commitments. Scoring is service-role.

alter table public.profiles add column prediction_points integer not null default 0;

-- Called by the close-battles cron (service role) once per closed battle.
create or replace function public.score_battle_predictions(
  p_battle_id uuid,
  p_winner uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update public.battle_predictions
    set is_correct = (predicted = p_winner)
    where battle_id = p_battle_id and is_correct is null;
  update public.profiles pr
    set prediction_points = pr.prediction_points + 10
    from public.battle_predictions bp
    where bp.battle_id = p_battle_id
      and bp.is_correct
      and bp.user_id = pr.id;
$$;
revoke execute on function public.score_battle_predictions(uuid, uuid) from public, anon, authenticated;
```

- [ ] Apply locally (`pnpm db:migrate`), add the migration's key clauses to the SQL-parity test suite if `packages/scoring/src/sql-parity.test.ts` covers new RPCs by convention (check how the previous RPC migrations are asserted; remember CRLF normalization). Commit: `feat(db): battle_predictions + scoring RPC`.

### Task 15: Zod schema + predict endpoint

**Files:**
- Modify: `packages/core/src/schemas.ts` — add:

```ts
export const battlePredictSchema = z.object({
  battleId: z.string().uuid(),
  predictedWinnerId: z.string().uuid(),
});
export type BattlePredictInput = z.infer<typeof battlePredictSchema>;
```

- Create: `apps/web/src/app/api/battles/predict/route.ts` + `route.test.ts`

**Interfaces:**
- Produces: `POST /api/battles/predict` → 201 `{ ok: true }`; 401 unauthenticated; 409 duplicate/closed; 422 invalid body or predicted-not-in-pair.

- [ ] **Step 1: Route** (RLS is the real enforcement; the route gives clean errors):

```ts
import { battlePredictSchema } from '@voxscore/core';
import { getRequestContext, createSupabaseServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { trackServer } from '@/lib/analytics-server';

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = battlePredictSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  // Insert AS THE USER — the RLS policy enforces open-battle + valid pair.
  const { error } = await supabase.from('battle_predictions').insert({
    battle_id: parsed.data.battleId,
    user_id: user.id,
    predicted: parsed.data.predictedWinnerId,
  });
  if (error) {
    return Response.json(
      { error: 'Already predicted, battle closed, or invalid pick' },
      { status: 409 },
    );
  }
  const service = createSupabaseServiceClient();
  if (service) await trackServer(service, 'prediction_submitted', user.id, {});
  return Response.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Route test** — same harness as `analytics/route.test.ts` (`vi.mock` supabase server + guard): cases 422 bad body, 401 no ctx, 201 insert ok (assert insert called with user_id from ctx, not from body), 409 on insert error.

- [ ] **Step 3:** Full gate, commit `feat(api): battle winner predictions`.

### Task 16: Wire scoring into close-battles cron + UI

**Files:**
- Modify: `apps/web/src/app/api/cron/close-battles/route.ts` (+ test)
- Modify: `apps/web/src/components/battle-arena.tsx`
- Modify: `apps/web/src/app/standings/page.tsx`
- Modify: all 7 message files

- [ ] **Step 1: Cron.** In the close-battles handler, immediately after each battle's winner is determined and Elo applied (locate the existing per-battle winner variable), add:

```ts
await service.rpc('score_battle_predictions', {
  p_battle_id: battle.id,
  p_winner: winnerPerformanceId,
});
```

Extend the cron's test: mock `rpc` and assert it is called once per closed battle with the winner id. Skip when a battle closes with no winner (tie/no votes) — matching however the existing code represents that case (if winner is null, don't call).

- [ ] **Step 2: Predict UI in battle arena.** Above the (locked) winner buttons, when both listens are NOT yet verified and no prediction was made this session, show a low-friction prediction row:

```tsx
// state: const [predicted, setPredicted] = useState<string>('');
async function predict(perfId: string) {
  const res = await fetch('/api/battles/predict', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ battleId: battle.battleId, predictedWinnerId: perfId }),
  });
  if (res.ok) setPredicted(perfId);
}
// JSX, only when !bothVerified && voteState !== 'ok':
<div className="rounded-lg border border-sky-800/50 bg-sky-500/5 p-3 text-center">
  <p className="mb-2 text-xs text-sky-300">{t('Battle.predictPrompt')}</p>
  <div className="grid gap-2 sm:grid-cols-2">
    {[battle.a, battle.b].map((s) => (
      <button
        key={s.performanceId}
        type="button"
        disabled={!!predicted}
        onClick={() => predict(s.performanceId)}
        className="truncate rounded-md border border-sky-800 px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {predicted === s.performanceId ? '✓ ' : ''}{s.title}
      </button>
    ))}
  </div>
  <p className="mt-2 text-[10px] text-neutral-500">{t('Battle.predictDisclaimer')}</p>
</div>
```

i18n — en: `"predictPrompt": "Before you listen: who takes this?"`, `"predictDisclaimer": "Predictions are a game — they never affect scores. Only verified listens unlock real votes."`; tr: `"predictPrompt": "Dinlemeden önce: sence kim kazanır?"`, `"predictDisclaimer": "Tahminler bir oyundur — skorları asla etkilemez. Gerçek oy için doğrulanmış dinleme gerekir."` (+5).

- [ ] **Step 3: Standings tab.** In `standings/page.tsx` add a second list: top 50 profiles by `prediction_points desc` (`.gt('prediction_points', 0)`), rendering handle + points. Heading — en: `"predictionLeague": "Prediction League"`, tr: `"predictionLeague": "Tahmin Ligi"` (under `"Standings"`, +5).

- [ ] **Step 4:** Full gate; live-verify with two accounts locally (predict → run close cron handler directly → points visible). Commit `feat: prediction pools`, PR, merge. **Ops:** prod migration.

---

# PHASE F (P1-3) — Season Wrapped
**Branch:** `feat/season-wrapped` · **Evidence:** Wrapped-style personal recap cards: ~60M shares (2021), +21% December downloads (2020).

### Task 17: Wrapped data assembly

**Files:**
- Create: `apps/web/src/lib/wrapped.ts` + `wrapped.test.ts`

**Interfaces:**
- Produces: `buildWrappedData(service, userId, seasonId): Promise<WrappedData>` where

```ts
export interface WrappedData {
  battlesWon: number;
  battlesLost: number;
  votesCast: number;
  validListens: number;
  predictionPoints: number;
}
```

- [ ] Implementation queries (all season-scoped where the table has `season_id`, otherwise season date-bounded — fetch the season row first for `starts_at`/`ends_at`):
  - battles won/lost: `battles` where `status = 'closed'` and `season_id = seasonId` and the user owns `perf_a`/`perf_b` (join through `performances.user_id`) — implement as: fetch user's performance ids (`performances.select('id').eq('user_id', userId)`), then count closed battles won = `winner_performance_id in (ids)`, lost = participant but not winner. (Check the battles table for the winner column name — the close cron sets it; grep `winner` in `close-battles/route.ts` and use the actual column.)
  - votesCast: `battle_votes` count where `voter_id = userId` and `created_at` within season bounds.
  - validListens: `verified_listens` count `is_valid` within bounds.
  - predictionPoints: read `profiles.prediction_points` (all-time — label the card accordingly).
- [ ] Unit-test with a chained-mock service (each `.from()` returning canned counts) asserting the assembled object. Commit `feat(web): wrapped data assembly`.

### Task 18: /wrapped page + share

**Files:**
- Create: `apps/web/src/app/wrapped/page.tsx` (Server Component, auth-required: no user → redirect to `/login?next=/wrapped`)
- Modify: 7 message files

- [ ] Render a story-styled card (dark panel, big numbers) with the five WrappedData stats + `<ResultShare headline={t('Wrapped.shareHeadline', {wins})} score={null} url="https://voxscore.app/wrapped" context="season_wrapped" />`. i18n (`"Wrapped"` section) — en: `"title": "Your season on VoxScore"`, `"wins": "Battles won"`, `"losses": "Battles lost"`, `"votes": "Verified votes cast"`, `"listens": "Verified listens"`, `"predictionPoints": "Prediction points"`, `"shareHeadline": "🏆 My VoxScore season: {wins} battle wins"`; tr: `"title": "VoxScore sezonun"`, `"wins": "Kazanılan düello"`, `"losses": "Kaybedilen düello"`, `"votes": "Doğrulanmış oy"`, `"listens": "Doğrulanmış dinleme"`, `"predictionPoints": "Tahmin puanı"`, `"shareHeadline": "🏆 VoxScore sezonum: {wins} düello galibiyeti"` (+5).
- [ ] Add a nav link visible when signed in (nav component: `apps/web/src/components/nav-auth.tsx` or the layout header — match where `Standings` links live): label en `"Wrapped"` / tr `"Sezonum"`.
- [ ] Full gate, commit `feat(web): season wrapped page`, PR, merge.

---

# PHASE G (P2-1) — Weekly Cohort Leagues (promotion/relegation)
**Branch:** `feat/cohort-leagues` · **Evidence:** Duolingo leagues: +17% learning time, 3× highly-engaged users.

### Task 19: Schema

**Files:**
- Create: `supabase/migrations/20260713120000_cohort_leagues.sql`

```sql
-- 20260713120000_cohort_leagues.sql
-- Weekly 30-person leagues with promotion/relegation (Duolingo model).
-- tier 0 = Bronze, 1 = Silver, 2 = Gold, 3 = Diamond.
create table public.league_cohorts (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null,
  tier       integer not null default 0 check (tier between 0 and 3),
  created_at timestamptz not null default now()
);
create table public.league_memberships (
  cohort_id  uuid not null references public.league_cohorts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  points     integer not null default 0,
  primary key (cohort_id, user_id),
  unique (user_id, week_start)
);
alter table public.profiles add column league_tier integer not null default 0;
alter table public.league_cohorts enable row level security;
alter table public.league_memberships enable row level security;
create policy league_cohorts_select_all on public.league_cohorts for select using (true);
create policy league_memberships_select_all on public.league_memberships for select using (true);
-- All writes are service-role (cron + point accrual). No user policies.
create index league_memberships_week_idx on public.league_memberships (week_start, user_id);
```

- [ ] Apply locally, commit `feat(db): cohort league tables`.

### Task 20: Points accrual helper + call sites

**Files:**
- Create: `apps/web/src/lib/league-points.ts` + `league-points.test.ts`
- Modify: `apps/web/src/app/api/listens/complete/route.ts` (+1 on valid listen), `apps/web/src/app/api/battles/vote/route.ts` (+2 on vote), `apps/web/src/app/api/cron/close-battles/route.ts` (+5 to the winning performance's owner)

**Interfaces:**
- Produces: `addLeaguePoints(service, userId, delta): Promise<void>` — best-effort/silent (same posture as grantBadge).

- [ ] Implementation:

```ts
import 'server-only';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** Monday (UTC) of the current week as 'YYYY-MM-DD'. */
export function currentWeekStart(now: Date): string {
  const day = now.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

/** Add league points to this week's membership. Silent no-op if the user
 *  has no cohort this week (they joined mid-week; next rotation picks them up). */
export async function addLeaguePoints(
  service: ServiceClient,
  userId: string,
  delta: number,
): Promise<void> {
  try {
    await service.rpc('add_league_points', {
      p_user_id: userId,
      p_week_start: currentWeekStart(new Date()),
      p_delta: delta,
    });
  } catch {
    /* best-effort */
  }
}
```

Add the RPC to the Task 19 migration file (before applying):

```sql
create or replace function public.add_league_points(
  p_user_id uuid, p_week_start date, p_delta integer
) returns void language sql security definer set search_path = public as $$
  update public.league_memberships
    set points = points + p_delta
    where user_id = p_user_id and week_start = p_week_start;
$$;
revoke execute on function public.add_league_points(uuid, date, integer) from public, anon, authenticated;
```

- [ ] Unit-test `currentWeekStart` (Mon/Sun/Wed cases) and the rpc delegation with a mocked service. Insert `addLeaguePoints(service, user.id, 1)` after valid listen, `(…, 2)` after successful battle vote insert, `(…, 5)` for the battle winner's owner in the close cron (owner = `performances.user_id` of the winning performance — the cron already loads performances; reuse). Extend each route's test with one assertion that the helper was called (mock `@/lib/league-points`).

- [ ] Full gate, commit `feat(league): weekly point accrual at listen/vote/win`.

### Task 21: Weekly rotation cron

**Files:**
- Create: `apps/web/src/app/api/cron/rotate-leagues/route.ts` + `route.test.ts`
- Modify: `vercel.json` (add cron `{ "path": "/api/cron/rotate-leagues", "schedule": "0 0 * * *" }` — daily; handler self-gates to Monday)

- [ ] Handler logic (service role; auth via the same cron-secret pattern the existing crons use — grep `CRON_SECRET` in `close-battles/route.ts` and copy the guard):
  1. `if (new Date().getUTCDay() !== 1) return Response.json({ skipped: 'not monday' })`
  2. Close last week: for each cohort of `week_start = lastMonday`, rank members by points; top 10 → `profiles.league_tier = min(tier+1, 3)`, bottom 10 → `max(tier-1, 0)` (single service update per member set, batched with `.in()`).
  3. Build this week: select active users = distinct `user_id` from `analytics_events` where `created_at > now()-interval '7 days'` and `user_id is not null`. Group by `profiles.league_tier`; shuffle deterministically (order by `md5(user_id || week)`); chunk into ≤30; insert one `league_cohorts` row + memberships per chunk.
  4. Queue a notification `league_week_started` (add to NotificationKind + push copy: en "New league week — your cohort is live", tr "Yeni lig haftası — grubun hazır") for each member, `notifyServer` loop capped at 5000.
- [ ] Route test: mock service; assert non-Monday skip; assert Monday path creates cohorts of ≤30 and applies promotion/relegation to the mocked prior week ranking.
- [ ] Full gate, commit `feat(league): weekly rotation cron (promote/relegate, 30-person cohorts)`.

### Task 22: /league page

**Files:**
- Create: `apps/web/src/app/league/page.tsx`
- Modify: nav (same place as Task 18's link), 7 message files

- [ ] Server Component: current user required (`/login?next=/league` redirect). Fetch my membership for `currentWeekStart` → cohort → all members with points, join profiles for handles, order desc. Render: tier name, countdown text to next Monday, ranked list with promotion zone (top 10, emerald border) and relegation zone (bottom 10, rose border), my row highlighted. i18n (`"League"` section) — en: `"title": "Weekly League"`, `"tierBronze": "Bronze"`, `"tierSilver": "Silver"`, `"tierGold": "Gold"`, `"tierDiamond": "Diamond"`, `"promotionZone": "Promotion zone"`, `"relegationZone": "Relegation zone"`, `"noCohort": "You'll be placed into a league next Monday — keep listening and voting to earn points."`; tr: `"title": "Haftalık Lig"`, `"tierBronze": "Bronz"`, `"tierSilver": "Gümüş"`, `"tierGold": "Altın"`, `"tierDiamond": "Elmas"`, `"promotionZone": "Terfi bölgesi"`, `"relegationZone": "Küme düşme bölgesi"`, `"noCohort": "Önümüzdeki pazartesi bir lige yerleştirileceksin — puan için dinlemeye ve oylamaya devam et."` (+5).
- [ ] Full gate, commit, PR `feat: weekly cohort leagues`, merge. **Ops:** prod migration + verify `vercel.json` cron registered after deploy.

---

# PHASE H (P2-2) — Custom Leagues (schools/friends — the atomic network tool)
**Branch:** `feat/custom-leagues` · **Evidence:** atomic-network launch strategy — seed small dense networks (a class, a choir, a friend group) instead of broad reach.

### Task 23: Schema + API

**Files:**
- Create: `supabase/migrations/20260713130000_custom_leagues.sql`
- Modify: `packages/core/src/schemas.ts`
- Create: `apps/web/src/app/api/leagues/route.ts` (create) + `apps/web/src/app/api/leagues/join/route.ts` + tests

```sql
-- 20260713130000_custom_leagues.sql
create table public.custom_leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 3 and 40),
  join_code  text not null unique,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.custom_league_members (
  league_id uuid not null references public.custom_leagues (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
alter table public.custom_leagues enable row level security;
alter table public.custom_league_members enable row level security;
create policy custom_leagues_select_all on public.custom_leagues for select using (true);
create policy custom_league_members_select_all on public.custom_league_members for select using (true);
create policy custom_league_members_insert_self on public.custom_league_members
  for insert with check (user_id = auth.uid());
create policy custom_league_members_delete_self on public.custom_league_members
  for delete using (user_id = auth.uid());
-- League creation goes through the API (service role) so join codes are
-- server-generated and creation is rate-limited; no user insert policy.
```

Zod (in `schemas.ts`):

```ts
export const leagueCreateSchema = z.object({ name: z.string().min(3).max(40) });
export const leagueJoinSchema = z.object({ code: z.string().regex(/^[A-Z2-9]{8}$/) });
```

- [ ] `POST /api/leagues`: auth + `rateLimit`; enforce max 3 leagues per owner (service count query → 409); generate code `Array.from({length: 8}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt]).join('')` via `crypto.getRandomValues`; service-insert league + owner membership (as user via supabase insert for membership); return `{ id, joinCode }` 201.
- [ ] `POST /api/leagues/join`: auth; look up league by code (service, `.eq('join_code', code).single()` → 404 if missing); insert membership AS USER (RLS self-check); duplicate → 409; 201 `{ leagueId }`.
- [ ] Route tests: same harness; create (201 + code shape `A-Z2-9{8}`, 409 over limit), join (404 bad code, 201, 409 dup).
- [ ] Commit `feat: custom leagues API`.

### Task 24: /leagues UI

**Files:**
- Create: `apps/web/src/app/leagues/page.tsx` (list mine + create form + join-by-code form)
- Create: `apps/web/src/app/leagues/[id]/page.tsx` (league leaderboard)
- Create: `apps/web/src/components/league-forms.tsx` (client island for the two forms)
- Modify: 7 message files

- [ ] League leaderboard ranking (Server Component, `[id]/page.tsx`): fetch member user_ids; rank by **battle wins this season**: count closed battles won per member (winner performance's `user_id` in member set, season-scoped) + show prediction_points column. Render join code prominently with a copy button reusing `ResultShare` with `headline: t('Leagues.inviteHeadline', {name})`, `url: https://voxscore.app/leagues/join?code=XXX`.
- [ ] Also create `apps/web/src/app/leagues/join/page.tsx`: reads `?code=`, if signed-out → `/login?next=/leagues/join?code=XXX`; if signed in, POSTs join client-side on button press and redirects to the league page. This is the shareable invite artifact (fires `invite_converted` with `{ leagueId }` on success).
- [ ] i18n (`"Leagues"` section) — en: `"title": "Your Leagues"`, `"createCta": "Create a league"`, `"namePlaceholder": "League name (your class, choir, crew…)"`, `"joinCta": "Join with code"`, `"codePlaceholder": "8-character code"`, `"inviteHeadline": "🎤 Join my VoxScore league: {name}"`, `"wins": "Wins"`, `"points": "Prediction pts"`; tr: `"title": "Liglerin"`, `"createCta": "Lig kur"`, `"namePlaceholder": "Lig adı (sınıfın, koron, ekibin…)"`, `"joinCta": "Kodla katıl"`, `"codePlaceholder": "8 karakterlik kod"`, `"inviteHeadline": "🎤 VoxScore ligime katıl: {name}"`, `"wins": "Galibiyet"`, `"points": "Tahmin puanı"` (+5).
- [ ] Full gate, commit, PR `feat: custom leagues (schools/friends)`, merge. **Ops:** prod migration.

---

# PHASE I (P2-3) — TikTok/Reels UGC Kit
**Branch:** `feat/share-kit` · **Evidence:** Smule's TikTok UGC spike (~4-5× installs, zero paid). **Hard rule:** we never provide video downloads — the kit is card images + copy blocks the user films THEMSELVES.

### Task 25: Share-kit page

**Files:**
- Create: `apps/web/src/app/performance/[id]/share-kit/page.tsx`
- Modify: `apps/web/src/app/performance/[id]/page.tsx` (link), 7 message files

- [ ] Server Component: fetch perf + score (same queries as the performance page). Render:
  1. The existing story image (`/performance/[id]/story-image`) displayed with a download link (`<a download href=...>`) — this is OUR generated card, not YouTube media.
  2. A copyable caption block (client copy button reusing the ResultShare copy pattern): en `"Rate my cover on VoxScore 🎤 {url} #VoxScoreChallenge #cover #singing"`, tr `"Cover'ımı VoxScore'da puanla 🎤 {url} #VoxScoreDuello #cover #vokal"`.
  3. A 3-step instruction list — en: `"kitStep1": "Download your score card"`, `"kitStep2": "Film your reaction or a 15s highlight of yourself"`, `"kitStep3": "Post with the caption — your card + link do the rest"`; tr: `"kitStep1": "Skor kartını indir"`, `"kitStep2": "Tepkini veya kendinden 15 sn'lik bir kesit çek"`, `"kitStep3": "Başlıkla paylaş — kartın ve linkin gerisini halleder"` (+5, under a new `"ShareKit"` section with `"title"`: en `"Share kit"` / tr `"Paylaşım kiti"`).
- [ ] Link from the performance page share row: `"ShareKit.title"` label → `/performance/[id]/share-kit`.
- [ ] Full gate, commit, PR `feat: TikTok share kit`, merge.

---

# PHASE J — Monetization Guardrails (policy, no code now)

- Premium v2 = real DSP measurement of the user's OWN recording (ADR 0003, measure-and-delete) surfacing the trusted "Measured" badge — status that makes shared cards MORE credible. This is the only paid surface.
- **Never paywall:** sharing, challenge links, voting, predictions, leagues. The viral loop must stay free end-to-end (Duolingo's referral-incentive failure +3% vs. retention/gamification wins is the cautionary evidence).
- Tournament entry fees / gifting: deferred until DAU justifies it; requires a separate legal review (esp. anything resembling paid contests per jurisdiction).

---

## Cross-cutting acceptance checklist (run at the END of every phase)

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green, coverage 100%.
- [ ] `pnpm exec supabase db reset` locally — all migrations apply clean from scratch.
- [ ] Manual browser pass of the changed flows on `pnpm dev` (guest + signed-in where relevant), zero console errors.
- [ ] Every new user-facing string exists in all 7 message files.
- [ ] New tables: RLS enabled + policies reviewed against "client can only touch own rows; scoring/aggregation is service-role only".
- [ ] PR body includes an **Ops** section: which migrations to `supabase db push`, any new env/cron.
- [ ] Analytics: confirm the new events flow into `analytics_events` (the k-factor dashboard reads: k = `share_sent(=share_clicked)` per user × `invite_accepted(=invite_converted or signup after challenge_link_visited)` rate).

## Execution order & dependency graph

```
Phase A (Tasks 1-6)  →  Phase B (7-9; Task 8 uses Task 1's exports via ResultShare only loosely)
Phase B → Phase C (Task 10 reuses GuestBattle from Task 8)
Phase C → Phase D (independent, but D's notify changes build on Task 11's scheduled_for column)
Phase D → Phase E → Phase F (F displays E's prediction_points)
Phase F → Phase G → Phase H (H's league page mirrors G's patterns)
Phase H → Phase I → Phase J (policy)
```

Strictly sequential is safe and is the requested mode. Phases D and E could run in parallel by separate agents if desired — nothing else should be parallelized (shared files: schemas.ts, battle-arena.tsx, close-battles cron).

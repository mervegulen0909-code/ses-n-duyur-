# ADR 0002 — Disable Browser Auto-Translation (Chrome/Google Translate)

- Status: Accepted — i18n follow-up implemented 2026-06-13 (see **Addendum**)
- Date: 2026-06-09
- Supersedes: none
- Related: 0001-stack-and-hard-constraints

## Context

The UI source is English-only and heavily interactive (React conditional text,
client state). Chrome's built-in "Always translate" / Google Translate rewrites
the live DOM: it replaces text nodes with `<font>…</font>` wrappers. When React
later tries to update a text node it owns (now removed/wrapped), reconciliation
fails — updates silently no-op or throw
`NotFoundError: Failed to execute 'removeChild'/'insertBefore' on 'Node'`.

Observed in production: on `/login`, with Chrome set to always-translate
English, the **Sign in ↔ Sign up** toggle stops working — the `<h1>` heading
`{mode === 'login' ? 'Sign in' : 'Create account'}` and the toggle button never
re-render, and the form becomes uninteractive. Any page with conditional or
state-driven text is vulnerable (nav, leaderboard, /add, /battle, etc.), so this
is an app-wide class of bug, not a one-page issue.

This is a long-standing, unfixed interaction between Google Translate and React
(facebook/react#11538). There is no fully reliable in-React workaround short of
full internationalization; keyed remounts / wrapped text reduce crashes but
cannot guarantee interactivity across every dynamic node.

## Decision

Disable browser auto-translation **site-wide** via three layered signals in the
root layout (`apps/web/src/app/layout.tsx`):

1. `<meta name="google" content="notranslate" />` — emitted through the Next.js
   Metadata API (`metadata.other.google = 'notranslate'`). Suppresses the
   translate prompt for the whole document.
2. `translate="no"` on `<html>` — the HTML5 standard attribute, which also
   covers the manual right-click "Translate to…" path that the meta tag alone
   does not.
3. `class="notranslate"` on `<html>` — the Google-recognized marker, belt-and-
   suspenders for engines that honor the class over the attribute.

`lang="en"` stays as-is: the content genuinely is English, and an accurate
`lang` is correct for accessibility and for browsers to know it need not
translate.

We chose global disable over the two alternatives:

- **Per-page `notranslate` on interactive routes (hybrid):** keep translation on
  read/browse pages, opt out only crash-prone subtrees. Rejected for the MVP —
  it requires correctly enumerating every interactive subtree forever; one
  missed conditional re-introduces the crash for translate users.
- **Full surgical React fix (keyed remounts / wrapped text):** keep translation
  everywhere. Rejected — most code, most fragile, and still cannot guarantee no
  crashes; it fights the framework rather than fixing the root cause.

## Consequences

- The `/login` toggle and all state-driven UI stay reliable regardless of the
  visitor's Chrome translation setting. Near-zero maintenance.
- **Tradeoff:** VoxScore is a _global_ product, and non-English visitors lose
  Chrome's one-click auto-translate site-wide. This is an explicit, accepted
  cost of the MVP.
- **Follow-up (not this PR):** real internationalization (e.g. `next-intl`) is
  the correct long-term answer for a global audience and would let us re-enable
  or remove these signals. Tracked as a future enhancement; re-enabling
  translation requires updating this ADR.

## Verification

- Served HTML for `/` and `/login` includes
  `<meta name="google" content="notranslate">` and
  `<html lang="en" translate="no" class="notranslate">`.
- Manual (cannot be automated headlessly): with Chrome "Always translate
  English" enabled, load `/login` — page renders untranslated, and the
  Sign in ↔ Sign up toggle + form submit work. Sanity-check `/`, `/add`,
  `/leaderboard`, `/performance/[id]` render and stay interactive.

## Addendum (2026-06-13) — i18n implemented; `translate="no"` deliberately kept

The "Follow-up" above is now done: app-controlled internationalization landed via
**`next-intl`** (EN + TR to start). Crucially, the three no-translate signals are
**deliberately preserved** — the app now performs translation itself, and browser
auto-translate stays OFF. The two systems must not both rewrite the DOM, or the
exact React-reconciliation crash this ADR documents returns. So:

- **What changed:** `lang` on `<html>` is no longer hard-coded `"en"` — it is now
  `lang={locale}` (`"en"` / `"tr"`), resolved per request from the `NEXT_LOCALE`
  cookie (else `Accept-Language`, else `en`) in `apps/web/src/i18n/request.ts`.
  UI strings live in `apps/web/messages/{en,tr}.json`; a `LanguageSwitcher` sets
  the cookie. Cookie-based locale (no `/[locale]` routing) so the Supabase auth
  middleware is untouched.
- **What did NOT change:** `translate="no"` + `class="notranslate"` on `<html>`
  and `metadata.other.google = 'notranslate'` all stay. The reconciliation hazard
  was browser translation fighting React; that hazard is unchanged. An accurate
  `lang` now also tells the browser the content is already in the user's language,
  so it has no reason to offer translation.
- **Verification (2026-06-13):** served HTML for `/` returns
  `<html lang="tr" translate="no" class="notranslate">` with a `NEXT_LOCALE=tr`
  cookie and `lang="en"` with `en`; the same page renders Turkish vs. English
  strings accordingly. typecheck · build · lint · e2e (7/7) green.
- **Scope note:** legal pages (`/terms`, `/privacy`, `/dmca`) remain English
  content for now — machine-translating legal text needs counsel review
  (CLAUDE.md). Their nav/chrome is localized; the prose is not.

Re-enabling _browser_ translation is still what this ADR forbids and would still
require superseding it. Adding more app languages does not — it is just another
`messages/<lang>.json` + a switcher entry.

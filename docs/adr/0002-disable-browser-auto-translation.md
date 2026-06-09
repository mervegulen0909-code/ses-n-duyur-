# ADR 0002 — Disable Browser Auto-Translation (Chrome/Google Translate)

- Status: Accepted
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
- **Tradeoff:** VocalLeague is a _global_ product, and non-English visitors lose
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

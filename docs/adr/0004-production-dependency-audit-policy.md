# ADR 0004 — Production dependency audit: pin transitively, allowlist only what has no fix

Date: 2026-09-03 · Status: accepted

## Context

CI's `verify` job runs `pnpm audit --prod --ignore-registry-errors` and fails the
build on any advisory. That step had been red on `main` for several runs — long
enough that it masked the steps behind it. Every finding sat in `apps/mobile`'s
**transitive** tree, none in a direct dependency:

```
expo > @expo/metro-config > postcss            expo > @expo/cli > @expo/xcpretty > js-yaml
expo > @expo/metro-config > postcss > nanoid   expo > @expo/metro > metro > image-size
expo-router > query-string > decode-uri-component
@expo/ui > @babel/core > @babel/helper-compilation-targets > browserslist
@siteed/audio-studio > @expo/config-plugins > glob > minimatch > brace-expansion
@siteed/audio-studio > @expo/config-plugins > ... > @xmldom/xmldom
react-native-web-webview > qs
react-native-web-webview > file-loader > webpack > schema-utils > ajv > fast-uri
```

The app is live on Google Play (`com.voxscore.app`, versionCode 14) and in App
Store review, so the constraint is: **clear the audit without changing what
ships to a device.**

## Decision

**1. Pin vulnerable transitive packages via `pnpm.overrides` (preferred).**

The repo already used this mechanism; this extends it. Each override is written
as a _range-scoped_ rule (`pkg@<vulnerable-range>: fixed-version`) so it only
rewrites versions inside the advisory's range and leaves unrelated major tracks
alone — e.g. `brace-expansion@>=4.0.0 <5.0.9` does not touch the 1.x/2.x/3.x
copies elsewhere in the tree, and `@xmldom/xmldom` gets one rule per affected
track (0.8.x, 0.9.x) rather than a single forced major bump.

This resolved 15 of the 18 advisories. All 15 sit in build-time tooling (Metro,
Babel, the Expo CLI, config plugins) that never reaches a device.

**2. Allowlist via `pnpm.auditConfig.ignoreGhsas` — only where no safe fix exists.**

Three advisories remain. Each is ignored for a specific, checkable reason:

| GHSA                  | Package                | Why it is not fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GHSA-w3rx-r6r6-pgpr` | `image-size`           | **No patched version exists.** The advisory reports its patched range as `<0.0.0`; the latest published release (2.0.2) is itself in the vulnerable range. Nothing to upgrade to.                                                                                                                                                                                                                                                                                                                                                                  |
| `GHSA-5p2g-fcmc-qvqq` | `image-size`           | Same package, same reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GHSA-vcc3-ghjq-m6fr` | `decode-uri-component` | **The only fix would break the shipped app.** Patched range is `>=0.5.0`, but 0.5.0 (and the whole 0.4/0.5 line) is ESM-only (`"type": "module"`, no CJS entry). It is reached through `expo-router > query-string@7.1.3`, which is CommonJS and does `require('decode-uri-component')`. Under Metro's interop that require returns the module namespace object, not the function — a runtime `TypeError` on any URL with encoded components, i.e. deep links and router query params. It would not fail the build; it would fail in users' hands. |

### Exposure of what we ignore

All three are denial-of-service issues in **build-time** code paths, reached only
by content the build itself feeds them:

- `image-size` is called by Metro on the app's own asset files at bundle time.
  A malicious ICNS/JXL/HEIF would have to already be committed to this repo.
- `decode-uri-component` is runtime, but the DoS requires an attacker-controlled
  malformed URI. The app only parses its own deep links and router URLs.

Neither is reachable from untrusted user input in VoxScore's threat model.

## Consequences

- `pnpm audit --prod` exits 0 again; `verify` gets past the audit step.
- The three ignored GHSAs are **silently** ignored — if `image-size` ships a fix,
  nothing tells us. Re-check the table above when bumping the Expo SDK, and drop
  entries that have become fixable.
- `ignoreGhsas` is per-advisory, not per-package: a _new_ `image-size` or
  `decode-uri-component` advisory will still fail CI rather than being swallowed.
- This step stays inherently time-sensitive: a newly published advisory against
  any transitive dependency turns `main` red with no change on our side. That is
  the intended trade-off (we want to hear about it), but it means an audit
  failure on `main` is not automatically someone's regression.

## Verification

The bar for "does not change what ships" was checked directly, not assumed:
`expo export --platform android` was run against `origin/main` and against this
change, and the two exports compared byte-for-byte. All 64 output files match,
including the bundle filename (`entry-8a37c70bccbc8a4bb6efef3cee8e5cb2.hbc`,
derived from bundle content). The `.hbc` payloads differ only in the random
temp-directory path Hermes embeds at build time
(`expo-bundler-<random>-<timestamp>/index.js`); bytecode before that string is
identical, and everything after it is the same content shifted by the 2-byte
length difference of that path.

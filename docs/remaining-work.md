# VoxScore — Remaining Work

> Updated 2026-07-13 after the integrity, notification, native attestation,
> private league, share-kit, and mobile parity implementation. This file lists
> only work that cannot be completed safely from the local repository.

## Required before production

- Apply every migration in `supabase/migrations` to the intended production
  project after verifying the CLI is linked to that project. The local reset is
  the source-of-truth migration gate.
- Configure all variables listed in `.env.example`. Production intentionally
  fails closed when Upstash, Turnstile, or native attestation credentials are
  absent. `/api/health/ready` reports missing variable **names**, never values.
- Create Android and iOS production builds with the operator-owned Play Console
  and Apple Developer credentials. Run the physical-device matrix in
  `docs/mobile-native-validation.md`, including App Attest and Play Integrity.
- Complete Play Console/App Store listings, screenshots, content ratings, Data
  Safety/privacy labels, support contact, and account-deletion declarations.
- Obtain legal review of Terms, Privacy, YouTube embedding/listen telemetry,
  DMCA workflow, and jurisdiction-specific contest rules.

## Operational hygiene

- Rotate any production secret that may have appeared outside the secret store,
  then redeploy and confirm `/api/health/ready` returns 200.
- Repair or remove stale Vercel/GitHub integrations so only the canonical
  deployment reports status.
- Set the final custom domain in `NEXT_PUBLIC_SITE_URL`, Supabase Auth redirect
  URLs, Turnstile host allowlist, and mobile `EXPO_PUBLIC_API_BASE_URL`.
- Configure log retention/alerting for readiness failures, cron delivery
  failures, native attestation rejection spikes, and notification dead letters.

## Product decisions still open

- A trusted YouTube duration source is still needed if genuine sub-15-second
  videos should be eligible for Verified Listen; client duration is not trusted.
- Embed-restricted videos currently degrade with an explanation. Decide whether
  to reject them during review instead.
- Premium real-DSP analysis remains restricted to a user's own recording. Never
  download or analyze YouTube media.
- A notification preferences screen would improve on OS-level permission alone.

No code task in this list authorizes a production deploy, database push, store
submission, secret creation, or legal representation.

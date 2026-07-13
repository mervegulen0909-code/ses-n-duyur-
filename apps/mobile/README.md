# VoxScore Mobile

Expo Router client for the VoxScore scoring, battle, weekly league, private
league, season recap, notifications, and measured-recording flows.

## Local development

From the repository root:

```bash
pnpm install
Copy-Item apps/mobile/.env.example apps/mobile/.env
pnpm --filter @voxscore/mobile start
```

Set the Supabase public URL/key and `EXPO_PUBLIC_API_BASE_URL` in `.env`. Android
emulators reach a host web server through `http://10.0.2.2:3000`; physical
devices need the host machine's LAN address.

Expo Go can exercise most read-only UI, but measured audio and native
attestation require a development or production build. Before a store release,
follow [mobile-native-validation.md](../../docs/mobile-native-validation.md).

## Verification

```bash
pnpm --filter @voxscore/mobile typecheck
pnpm exec expo-doctor apps/mobile
pnpm --filter @voxscore/mobile exec expo export --platform android
```

Production builds use `eas.json`; store signing and real Play Integrity/App
Attest credentials are intentionally operator-owned and are never committed.

# Mobile native validation

`@siteed/audio-studio` is excluded from Expo Doctor's React Native Directory
metadata check because the library does not declare New Architecture status in
that directory. This is not treated as proof of compatibility.

Before every store release, the production EAS build must pass this physical
device matrix:

- Android: record a 30–60 second WAV, upload, receive measured criteria, and
  confirm the local file is deleted.
- iOS: repeat the same flow on a real device (App Attest does not run in the
  simulator).
- Background/interruption: incoming call, permission denial, app background,
  network loss and retry.
- Verify there is no retained audio in app storage or Supabase Storage.
- Android: submit a single performance vote, battle vote, performance request,
  and private-league create/join; verify tampered request bodies are rejected.
- iOS: repeat the mutation matrix and verify reinstall/new-key registration,
  monotonic assertion counters, and replay rejection.

CI still runs Expo Doctor and creates an Android JS bundle. Store signing,
Play Integrity and App Attest require the external Play Console/Apple Developer
credentials described in `DEPLOY.md`.

# VoxScore Store Listing Pack

Prepared from the shipping feature set.

Support/contact email is live and verified in Play store settings: `destek@voxscore.app`
(phone `+905352811235`, website `https://voxscore.app`). The `SUPPORT_EMAIL_REQUIRED`
placeholders below are resolved.

**Play listing is English-only as of 2026-08-05** — the `tr-TR` translation was removed so the
product ships under one language. The Turkish copy is kept below for future reuse, not for a
live listing.

## Google Play - English

**App name:** VoxScore

**Short description:**
Compare vocal covers, measure your voice, and climb the global league.

**Full description:**
VoxScore is a global vocal performance league where every song becomes a fair competition.

Add a YouTube vocal performance without uploading or downloading its media. Compare different versions of the same song, complete verified listens, score performances across vocal criteria, and choose winners in head-to-head battles.

Record a performance you own to receive measured vocal feedback. Your recording is analyzed in memory and immediately deleted. Only the resulting measurements are saved.

Key features:

- Same-song performance rankings
- Verified listening before voting
- Head-to-head vocal battles and Elo standings
- Nine-criterion community scoring
- Private, ephemeral analysis of your own recording
- Profiles, comments, moderation, and account deletion

AI scores shown for YouTube performances are clearly labeled Provisional AI Estimates. They are not presented as real audio measurements. VoxScore embeds YouTube videos and never downloads or hosts their media.

**Support email:** SUPPORT_EMAIL_REQUIRED

## Google Play - Turkish

**Uygulama adı:** VoxScore

**Kısa açıklama:**
Vokal yorumları karşılaştır, sesini ölç ve küresel ligde yüksel.

**Tam açıklama:**
VoxScore, her şarkıyı adil bir yarışmaya dönüştüren küresel vokal performans ligidir.

YouTube medyasını yüklemeden veya indirmeden bir vokal performansı ekle. Aynı şarkının farklı yorumlarını karşılaştır, doğrulanmış dinlemeleri tamamla, performansları vokal kriterlere göre puanla ve birebir düellolarda kazananı seç.

Sana ait bir performansı kaydederek ölçülmüş vokal geri bildirimi al. Kaydın bellekte analiz edilir ve hemen silinir. Yalnızca ortaya çıkan ölçüm sonuçları saklanır.

Öne çıkanlar:

- Aynı şarkıya ait performans sıralamaları
- Oy vermeden önce doğrulanmış dinleme
- Birebir vokal düelloları ve Elo puan durumu
- Dokuz kriterli topluluk puanlaması
- Kendi kaydın için geçici ve gizli analiz
- Profil, yorum, moderasyon ve hesap silme

YouTube performansları için gösterilen YZ puanları açıkça Geçici YZ Tahmini olarak etiketlenir; gerçek ses ölçümü olarak sunulmaz. VoxScore YouTube videolarını yalnızca gömer, medyayı indirmez veya barındırmaz.

**Destek e-postası:** SUPPORT_EMAIL_REQUIRED

## Apple App Store - English

Apple's fields are not the same shape as Play's, so this is an adaptation, not a copy.
Character limits are Apple's hard caps; counts below are the drafted lengths.

**App Name** (max 30): `VoxScore - Vocal League` — 23. Plain `VoxScore` was already taken
globally, so the App Store Connect record (ASC ID `6803250678`) was created under this name.

**Subtitle** (max 30): `Sing, score, climb the league` — 29

**Keywords** (max 100, comma-separated, no spaces, do not repeat words already in the name or
subtitle — Apple indexes those automatically):

```
vocal,cover,karaoke,voice,contest,ranking,duel,pitch,talent,battle,rate,compare,music,vote
```

— 90 characters.

**Promotional Text** (max 170, editable without a new review):

Every cover of the same song goes head to head. Finish a verified listen, score across nine
vocal criteria, and find out where your voice really lands.

**Description** (max 4000):

VoxScore is a global vocal performance league where every song becomes a fair competition.

Add a YouTube vocal performance without uploading or downloading its media. Compare different
versions of the same song, complete verified listens, score performances across vocal criteria,
and choose winners in head-to-head battles.

Record a performance you own to receive measured vocal feedback. Your recording is analyzed in
memory and immediately deleted. Only the resulting measurements are saved.

Key features:

- Same-song performance rankings
- Verified listening before voting
- Head-to-head vocal battles and Elo standings
- Nine-criterion community scoring
- Private, ephemeral analysis of your own recording
- Profiles, comments, moderation, and account deletion

Community safety: every performance and comment can be reported, abusive accounts can be
blocked, moderators review reports, and you can delete your account and its content at any time.

AI scores shown for YouTube performances are clearly labeled Provisional AI Estimates. They are
not presented as real audio measurements. VoxScore embeds YouTube videos through the official
YouTube player and never downloads or hosts their media.

**URLs:** Marketing `https://voxscore.app` · Privacy Policy `https://voxscore.app/privacy`

Support URL: `https://voxscore.app/support` — the route exists (`apps/web/src/app/support/page.tsx`)
and is live. The earlier note in this file claiming it was missing was stale.

**Category:** Primary Music · Secondary Entertainment

**Copyright:** `2026 Ferhat Gülen` — the organization migration was **cancelled on 2026-08-14**
and the account stayed Individual, so the copyright line must match the individual seller, not
the company. Do not enter the FERSA Ltd. name here unless the account is migrated later.

**App Review notes must include:** a working demo account, an explanation that voting is gated
behind Verified Listen (a reviewer who skips the video cannot vote and may report it as broken),
why the microphone is requested, and that AI scores on embedded YouTube content are labeled
provisional rather than measured.

## iOS readiness (as of 2026-08-06)

Every code-side blocker found in the 2026-08-05/06 audit is closed. What is left is not
engineering work — it waits on Apple.

### Closed

1. **Sign in with Apple** — Guideline 4.8 requires an equivalent privacy-preserving login
   next to Google. Added via `expo-apple-authentication` with `signInWithIdToken`; Supabase's
   Apple provider is enabled with `com.voxscore.app` in Client IDs.
2. **Guideline 1.2, all four parts** — filtering before posting (comments plus profile bio and
   link labels), in-app reporting, user blocking, and published contact info. Blocking was
   verified against the live database and the follow-severing trigger with it.
3. **Privacy manifest** — `ios.privacyManifests` declares the required reason APIs our
   dependencies actually use, copied from their own `PrivacyInfo.xcprivacy` files rather than
   guessed. Mandatory for App Store Connect uploads since 1 May 2024.
4. **iOS compiles** — verified with `ios-simulator` profile builds, which need no Apple
   credentials and so do not touch the pending membership migration.
5. **Support URL** — `/support` is live, with every internal link resolving.

### ~~Waiting on Apple~~ — resolved

The **Individual → Organization migration was cancelled on 2026-08-14**; the account ships as
Individual (team `YMW2NVHASS`). The old warning against creating the app record or signing
agreements before migration no longer applies — the record exists and the build is uploaded.
The name correction from "Perhat" to "Ferhat" was applied by Apple Support (case
20000126564887) and the Apple Account shows `Ferhat Gülen`; the developer team label still
reads the old spelling and now has no migration to fix it, so it needs a separate request if
the wrong spelling on the seller line matters.

### Still to produce

**Screenshots at iPhone sizes.** The Play set is 1080x2340, which is not an accepted iPhone
aspect, so these have to be captured from the app running on a real iPhone (an iPhone 12 Pro
Max is available). Signing credentials now exist, build 1.0.0 (3) is **Ready to Submit** in
TestFlight, so this is the only remaining blocker before "Submit for Review" alongside the age
rating questionnaire and the version metadata above.

## How production access was obtained (measured, 2026-07-31 → 08-06)

Recorded here because the received wisdom is wrong and it cost real time to find out.

The developer account started as a **personal** account, which carries Google Play's
"12 testers opted in for 14 continuous days" requirement and locks the production track.
Converting the account to an **organization** removed that requirement **retroactively**:
after the conversion the tester block disappeared from the dashboard and the production
track opened. Community answers and three separate AI research passes all claimed the
requirement would persist because the app had been created under a personal account.
Measured on screen, that is false — the requirement attaches to the account, not the app.

Facts worth keeping:

- The conversion is **free**, happens **in place**, and does **not** need a new developer
  account. It creates a new *payments profile*, not a new account. It is **one-way**.
- The gate for starting it is a **verified company website**, not the D-U-N-S number —
  the "Change account type" button stays disabled until the site is verified.
- The **D-U-N-S number came free and the same night** from Apple's own D-U-N-S lookup
  tool, which needs only an Apple ID and no paid membership. The number is valid across
  platforms, so the one obtained through Apple was used for the Google Play conversion.
  A local D&B partner had quoted 15,750 TL for a five-business-day turnaround.
- Organization verification asked for the **company registry certificate**, not personal
  ID, and accepted a one-year-old scanned certificate.
- Wait **72 hours** after the conversion before submitting a new app.
- The conversion does **not** update the public **developer name** shown on the store —
  that is a separate field under Account details → About you and kept the old personal
  name here.

Until the account strategy is settled, do not let anyone install the app **from Play**
(closed testing included): a package name with even one lifetime install is locked
forever, while a package name with zero installs stays reusable. Device testing during
that window should use sideloaded APKs.

The reusable version of this lives in the `yayin-hazirlik-denetimi` skill,
`references/04-hesap-turu-ve-testci-sarti.md`.

## Screenshot Sequence

1. Discover: latest performances and the VoxScore league promise.
2. Same-song ranking: multiple singers competing on one song.
3. Performance detail: embedded video, score breakdown, and provisional label.
4. Verified Listen: listening progress before voting unlocks.
5. Battle: two performances with the both-sides-listened gate.
6. Measured recording: owned recording flow and measured result.
7. Standings: Elo positions and win records.
8. Profile: performances, legal links, and account deletion.

Capture Android phone screenshots at 1080x1920 or another Play-supported portrait size. Do not include prototype screens, test labels, personal email addresses, or debug overlays.

## Submission Blockers

- Choose and publish the support/privacy contact email.
- Complete Google Play Data Safety using `store-privacy-disclosures.md`.
- Have counsel review the live Terms and Privacy Policy.
- Enable Play Integrity and configure server credentials before enabling native single-performance voting.

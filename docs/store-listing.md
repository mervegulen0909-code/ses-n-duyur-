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

**App Name** (max 30): `VoxScore` — 8

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

Support URL: **there is no `/support` route.** `apps/web/src/app` has `company`, `privacy`,
`terms` and `dmca` only. Apple requires a Support URL that actually resolves and offers a way to
get help, so either point it at `https://voxscore.app/company` (which carries the company and
contact details) or add a real support page before submitting.

**Category:** Primary Music · Secondary Entertainment

**Copyright:** `2026 FERSA Elektronik Sanayi ve Ticaret Ltd. Sti.` (only after the organization
migration completes; while the membership is individual this line would carry a personal name)

**App Review notes must include:** a working demo account, an explanation that voting is gated
behind Verified Listen (a reviewer who skips the video cannot vote and may report it as broken),
why the microphone is requested, and that AI scores on embedded YouTube content are labeled
provisional rather than measured.

## iOS submission blockers (verified 2026-08-05)

1. **Sign in with Apple is REQUIRED — this will cause rejection as-is.** `src/app/login.tsx:101`
   authenticates the primary account with Google via `supabase.auth.signInWithOAuth`. App Store
   Review Guideline 4.8 requires an equivalent privacy-preserving login alongside any
   third-party social login. None of the five exemptions apply: the exemption for own-account
   systems requires the app to use them *exclusively*, and email/password sits next to Google
   rather than replacing it. Either add Sign in with Apple, or drop the Google button on iOS.
2. **The app has never been built for iOS.** There is no `ios/` directory (Expo CNG generates
   it at build time) and no iOS build exists in EAS history. Compilation is unverified —
   `react-native-reanimated` 4, `react-native-webview`, and the `@siteed/audio-studio` plugin
   are the parts most likely to surface iOS-specific problems. A `simulator` profile build
   needs no Apple credentials and answers "does it compile" without touching the pending
   organization migration.
3. **Individual to Organization migration is pending** (requested 2026-08-05). Accepting App
   Store Connect agreements, entering tax/banking details, or creating the app record before it
   completes means redoing them under the company, and the seller name would show a personal
   name in the meantime.
4. **Screenshots do not exist at iPhone sizes.** The Play set is 1080x2340, which is not an
   accepted iPhone aspect. These have to be captured from the app running on a real iPhone
   (an iPhone 12 Pro Max is available) or a simulator.

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

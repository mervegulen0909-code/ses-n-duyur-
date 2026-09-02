# VoxScore — Mağaza Dışı İlk Dalga (lansman metinleri + kapılar)

Hazırlayan: görünürlük denetimi, 2026-08-23 (`magaza-gorunurlugu` skill).
**Gönderiyi KULLANICI yapar, ajan değil.** Ajanın işi metin + kural + hesap denetimi.

## Paylaşılabilir tek cümle (her kanalın çekirdeği)

> **"A singing battle league where your vote doesn't count until the app has
> verified you actually listened to both performances — end to end."**

Kanıtlanabilir iddialar (özellik listesi değil, doğrulanabilir farklar):

1. **Verified Listen** — dinlemeden oy veremezsin; sunucu tarafında zorlanır.
2. **Dürüst AI etiketi** — YouTube performans puanları "Provisional AI Estimate"
   olarak işaretli; gerçek ses ölçümü diye satılmaz.
3. **Medya indirilmez** — YouTube yalnız gömülür; kendi kaydın bellekte analiz
   edilip anında silinir.

## Hesap kapısı — GÖNDERMEDEN ÖNCE doğrula

| Platform                               | Durum (2026-08-23)                                                                | Gereken                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hacker News (`arfgln`)                 | 🔴 Show HN yeni hesaba kapalı — 18 Ağustos'ta ÖLÇÜLDÜ (`showlim` sayfasına düştü) | Birkaç hafta doğal katılım (yorum, oy), sonra tekrar dene                                                                                                      |
| Reddit                                 | ❓ hesap bilinmiyor                                                               | `old.reddit.com/user/<ad>` → yaş + karma + geçmiş; r/androidapps Kural 4: `[Self Promo]` etiketi, 45 günde bir, geçmiş etkinlik ŞART                           |
| Product Hunt                           | ❓ profil bilinmiyor                                                              | Profil %100 tamam + lansman günü 3 saat başında olma + dışarıdan trafik getirecek en az 1 kanal. Bunlar yoksa ERTELE (Scanizma PH turu 2 oyla bitti — ölçüldü) |
| TR forumları (Ekşi, DonanımHaber, R10) | ⚠️ dil uyumsuzluğu                                                                | Mağaza sayfası SADECE İngilizce — TR forumdan gelen kullanıcı İngilizce sayfaya düşer. Ya tr-TR listing geri eklenir, ya TR kanalları beklenir                 |

`[ÇIKARIM]` Üç ana kanalın üçü de hesap olgunluğuna takılıyor. Kısa vadede en
yüksek getirili iş mağaza içi çark: **puan isteme mekanizması eklendi**
(`feat/in-app-review-prompt`) + ASO revizyonu (`docs/store-listing.md`).

## Gönderim sırası (hesaplar hazır olunca)

1. En toleranslı kanal (PH ya da yerel forum) → tepkiyi ölç
2. Öğrenilenle tek şanslı kanala git (HN)
3. Reddit en son, hesap olgunsa
4. Aynı gün hepsine birden GÖNDERME — sinyal ayrıştırılamaz

---

## Taslak 1 — Show HN (hesap olgunlaşınca)

**Title:** Show HN: VoxScore – a singing league where votes require a verified full listen

```
I kept seeing vocal covers with wildly unfair comparison sections — whoever
brings more fans wins, nobody actually listens.

VoxScore is a global vocal performance league built around one rule: your vote
doesn't count until the app has verified you listened to both performances,
end to end. Enforced server-side, not on the client.

What it does:
- Same-song rankings: every cover of a song competes in one table
- 1v1 vocal battles with Elo standings
- Nine-criterion community scoring, only after a Verified Listen
- Record your own take to get measured vocal feedback — analyzed in memory,
  deleted immediately, only the numbers are kept

What it does NOT do:
- It never downloads or hosts YouTube media — embed only
- AI scores on YouTube performances are labeled "Provisional AI Estimate";
  we don't pretend an LLM measured audio it never heard
- No ads, no ad SDKs

Play Store: https://play.google.com/store/apps/details?id=com.voxscore.app
Web: https://voxscore.app

Happy to answer anything about the verified-listen enforcement or the scoring
math (open, deterministic core).
```

## Taslak 2 — Product Hunt

**Tagline (≤60):** The singing league where every vote is a verified listen

**Description:**

```
VoxScore turns every song into a fair competition. Add a vocal cover by
YouTube link, listen — verifiably, end to end — then score it across nine
criteria or pick a battle winner. Rankings run on Elo, votes without a
verified listen simply don't count, and AI estimates are always labeled as
estimates. Record your own performance to get private, measured vocal
feedback that's analyzed in memory and instantly deleted.
```

**First comment (maker):** neden yaptım hikâyesi — HN taslağının 1. paragrafı + soruya açık kapanış.

## Taslak 3 — Reddit r/singing (kurallara göre uyarlanır)

**Title:** I built a singing league where you can't vote without actually listening — looking for brutal feedback from singers

```
Cover comparison threads always end the same way: the bigger fanbase wins.
So I built VoxScore — a league where a vote only counts after the app
verifies you listened to both performances fully (server-side).

It ranks covers of the same song against each other, runs 1v1 battles with
Elo, and lets you score across nine vocal criteria. If you record your own
take, you get measured feedback — the recording is analyzed in memory and
deleted immediately.

Honest limits: AI scores on YouTube covers are labeled provisional estimates
(we never claim to have measured audio we only embedded), and the catalog is
still growing.

Play Store: https://play.google.com/store/apps/details?id=com.voxscore.app

What would make this actually useful for you as a singer?
```

## Taslak 4 — YouTube kanal ulaşımı (karşılaştırma/tepki kanalları)

**Subject:** A fair way to run your "who sang it better" videos

```
Hi <name>,

I watch your <specific video> comparisons — the comment wars over who won are
half the fun and half the problem. I built VoxScore, a free app where every
cover of a song competes in one ranked table and votes only count after a
verified full listen, so the bigger fanbase can't just brigade the poll.

If you ever want a neutral scoreboard for a comparison video, I'd love to set
up the matchup for you — takes two YouTube links, nothing to upload.

Play Store: https://play.google.com/store/apps/details?id=com.voxscore.app
```

## Gönderim sonrası (ilk 2-3 saat)

- Başında ol; cevapsız gönderi ölür
- Eleştiriye savunmasız cevap; düzeltme sözü verme, kabul et
- Tekrar eden soruyu mağaza açıklamasına ekle — bedava kullanıcı testi

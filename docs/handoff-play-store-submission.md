# HANDOFF — VoxScore Google Play Mağaza Gönderimi

**Tarih:** 2026-07-25
**Durum:** Play Console hazırlığı ~%70 bitti. Kalanlar aşağıda.

## Bağlam / kimlik bilgileri

| Ne                       | Değer                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| Play Console geliştirici | "arif gülen", hesap ID `6150160684223109926`                              |
| Uygulama                 | VoxScore, app ID `4973880952788931061`, paket `com.voxscore.app`          |
| Uygulama durumu          | **Taslak** (henüz hiçbir şey yayınlanmadı)                                |
| Store listing dili       | **Sadece İngilizce** (kullanıcı kararı: "tuekıye ıcın degıl bu uygulama") |
| Destek e-postası         | `destek@voxscore.app` → Porkbun forward → `mervegulen0909@gmail.com`      |
| Domain/DNS               | Porkbun, hesap kullanıcı adı `voxscoreapp` (bkz. `DEPLOY.md` §6b)         |
| EAS hesabı               | `arfgln` / `arfglnddyma@gmail.com`, proje `@arfgln/voxscore`              |

## ✅ TAMAMLANANLAR

### Mağaza girişi (Ana mağaza girişi — İngilizce)

- Uygulama adı: VoxScore
- Kısa açıklama (70/80) + Tam açıklama (~980 kar.) — kaynak `docs/store-listing.md`
- Uygulama simgesi 512×512 ✅ · Feature graphic 1024×500 ✅
- Telefon ekran görüntüleri **8/8** ✅ · 7" tablet **2/8** ✅ · 10" tablet **2/8** ✅
- Kaydedildi, kırmızı hata yok

### Mağaza ayarları

- Kategori: **Müzik ve Ses**
- Destek e-postası: `destek@voxscore.app` · Web sitesi: `https://voxscore.app`

### Uygulama içeriği beyanları

- **Gizlilik politikası URL'si**: `https://voxscore.app/privacy` ✅
- **Reklam**: "Hayır, uygulamam reklam içermiyor" ✅
- **İçerik derecelendirmesi (IARC)**: ✅ TAMAMLANDI — ESRB Teen / PEGI 12 / USK 12 / IARC 12+ / ClassInd 12.
  İçerik tanımlayıcı: "Uygunsuz Dil", Etkileşimli öğe: "Kullanıcı Etkileşimi"

### Build

- **Production AAB hazır**: `voxscore-v1.0.0-vc8.aab` (v1.0.0, versionCode 8, commit `9a6558b`)
  - Masaüstünde: `C:\Users\arfgl\OneDrive\Desktop\VoxScore Play Store Görselleri\voxscore-v1.0.0-vc8.aab`
  - EAS build id `e5154220-7585-4a1c-84a8-26015ff99652`
- İngilizce dil testi cihazda geçti (uygulama arayüzü sorunsuz İngilizce'ye dönüyor).
  Not: gömülü YouTube oynatıcısının kendi metni cihazın **OS diline** bağlı — bizim
  kontrolümüzde değil, incelemeci cihazında otomatik İngilizce olacak. Bu bir hata değil.

### Görseller (masaüstünde hazır)

`C:\Users\arfgl\OneDrive\Desktop\VoxScore Play Store Görselleri\`

- `play-icon-512.png`, `feature-graphic-1024x500.png`
- `screenshots\01-discover.png` … `08-profile.png` (+ `contact-sheet.png`)

## ⏳ YARIM KALAN — VERİ GÜVENLİĞİ (Data Safety)

Form 5 adımlı. **1–4. adımlar dolduruldu ama HENÜZ GÖNDERİLMEDİ.**

Doldurulan değerler:

- Veri toplanıyor: **Evet** · Aktarımda şifreleme: **Evet** (HTTPS)
- Hesap oluşturma: **Kullanıcı adı ve şifre** + **OAuth**
- Hesap silme URL'si: `https://voxscore.app/account/delete` · Kısmi veri silme: **Hayır**
- Veri türleri: Kişisel bilgiler (E-posta, Kullanıcı kimlikleri) · Uygulama etkinliği
  (Uygulama işlemleri, Kullanıcı tarafından oluşturulan diğer içerikler) · Cihaz kimlikleri
- Her tür için: Toplandı=evet, Paylaşıldı=hayır, Kısa süreli=hayır,
  Amaç = Uygulama işlevselliği (+ e-posta/kullanıcı ID için Hesap yönetimi).
  Cihaz kimlikleri (push token) için zorunluluk = **Kullanıcılar seçebilir**.

### 🔴 EKSİK: Ses kaydı beyanı

`Ses dosyaları → Konuşma veya ses kayıtları` işaretlendi ama **3. adımda kaydolmadı**
(Play Console SPA'sı bu oturumda çok kararsız çalıştı, geri navigasyon çalışmadı).

**Bu KRİTİK** — doğrulandı ki mikrofon kaydı canlı olarak sevk ediliyor:

- `apps/mobile/app.json` → `@siteed/audio-studio` plugin → `RECORD_AUDIO` izni
- `apps/mobile/src/app/measure/[performanceId].tsx:127,134` → `requestPermissionsAsync()` + `startRecording()`
- Erişim yolu: `apps/mobile/src/app/performance/[id].tsx:511-518` "AI Judge" butonu
  (performans sahibine görünür) → `router.push('/measure/<id>')`

### ✅ Çözüm hazır: yamalı CSV

Play Console'un "CSV'den içe aktar" özelliği kullanılacak. Dosya **hazır**:

```
C:\Users\arfgl\Downloads\data_safety_import.csv
```

Orijinal export'a göre şu 5 satır `true` yapıldı:
| Satır | Alan | Değer |
| --- | --- | --- |
| 45 | `PSL_DATA_TYPES_AUDIO / PSL_AUDIO` | true (ses kaydı türünü beyan et) |
| 461 | `PSL_AUDIO / DATA_USAGE_ONLY_COLLECTED` | true (toplandı) |
| 463 | `PSL_AUDIO / PSL_DATA_USAGE_EPHEMERAL` | true (analiz edilip **hemen silinir**, ADR 0003) |
| 464 | `PSL_AUDIO / USER_CONTROL_OPTIONAL` | true (Measured özelliği opt-in) |
| 466 | `PSL_AUDIO / COLLECTION_PURPOSE = APP_FUNCTIONALITY` | true |

**Yapılacak:** Veri güvenliği sayfası → sağ üst **"CSV'den içe aktar"** → bu dosyayı seç → 5. adıma (Önizleme) kadar ilerle → **Kaydet/Gönder**.

## ⏳ KALAN İŞLER (sırayla)

1. **Veri güvenliği**: yukarıdaki CSV'yi içe aktar, gönder.
2. **Oturum açma bilgileri (test hesabı)** — 🔴 BLOKE
   Play incelemecisinin oy verme/performans ekleme gibi giriş gerektiren özellikleri
   test edebilmesi için gerçek bir hesap gerekiyor.
   _Ben hesap oluşturamam (güvenlik kuralı: "Creating accounts... prohibited")._
   Kullanıcı `voxscore.app` veya mobil uygulamadan bir test hesabı açıp e-posta+şifreyi
   vermeli. Sonra: Uygulama içeriği → Oturum açma bilgileri → "Evet, kısıtlanmış
   bölümler var" → kimlik bilgilerini + talimatları gir.
   Ana ekran/katalog giriş **gerektirmez** (incelemeci içeriği hemen görür); yalnızca
   oy/ekleme/profil/lig gated.
3. **Hedef kitle ve içerik** — 2. madde bitmeden AÇILMIYOR (Play bunu şart koşuyor).
   Yaş grubu: 13+ (uygulama çocuklara yönelik değil, gizlilik politikası da böyle diyor).
4. **Reklam Kimliği beyanı** — "Hayır, reklam kimliği kullanmıyorum" (ad SDK yok).
5. **Sürüm oluştur**: Test edin ve yayınlayın → track seç (Internal testing önerilir) →
   `voxscore-v1.0.0-vc8.aab` yükle.
   `eas submit` **kullanılamıyor**: ayrı bir Google Play Android Publisher API service
   account gerekiyor (mevcut olan yalnızca Play Integrity kapsamında). Manuel yükleme.
6. **Gizlilik politikası uyarı satırı** — `apps/web/src/app/privacy/page.tsx` başında
   _"This policy... has not yet been reviewed by a lawyer. Do not rely on it as a final,
   store-ready policy"_ yazıyor. İncelemeciye ve kullanıcıya kötü görünür.
   Yayına almadan önce ya avukata baktırılıp kaldırılmalı ya da metin yumuşatılmalı.

## İnsan-only (benim yapamayacaklarım)

- Test hesabı oluşturma (yukarıda #2)
- Terms/Privacy hukuki inceleme
- Play Android Publisher API service account oluşturma
- Nihai "Gönder / Yayınla" tıklaması

## Teknik notlar (bir sonraki oturum için)

- **Play Console SPA bu oturumda çok kararsızdı**: `Page.captureScreenshot` sık sık
  30s timeout verdi, bölüm metinleri boş render oldu, "Geri" navigasyonu çalışmadı.
  Çare: her tıklamadan sonra 3-5sn bekle; `form_input` React state'e **işlemiyor** —
  mutlaka gerçek `left_click` kullan; mümkünse **CSV import/export** yolunu tercih et.
- adb yolu: `/c/Users/arfgl/AppData/Local/Android/Sdk/platform-tools/adb.exe`
  (PATH'te yok). Pull/push için `export MSYS_NO_PATHCONV=1` şart.
- Cihaz: A56 `RFCY90DPCKN`, 1080×2340. UI otomasyonunda ekran-görüntüsü koordinatı
  değil `uiautomator dump` + tam `bounds` kullan.
- eas CLI: `npx --yes eas-cli ...` (projede kurulu değil).

# VoxScore — Kalan İşler: Kopyala-Yapıştır Prompt'lar

> Oluşturulma: 2026-07-17. Kaynak: Codex release-readiness denetimi (kod üzerinde
> doğrulandı) + deploy oturumu bulguları. Her prompt yeni bir Claude oturumuna
> bağımsız olarak yapıştırılabilir. Sıra = önerilen teslimat sırası.
>
> Durum özeti (2026-07-17): PR #63 canlı (provisional restore + fairness).
> PR #64 açık (tam-izleme oy kapısı, branch `codex/full-verified-listen`) — CI
> bekliyor, DEPLOY EDİLMEDİ. Analyzer v2 canlı (rev 00006). APK versionCode 7
> iki cihazda. 57 mock skor gerçek LLM'e rescore edildi (0 mock kaldı).

---

## P1 — PR #64'ü yayınla (merge + deploy zinciri)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Önce oku: CLAUDE.md, .claude/handoff/latest.md

Görev: PR #64 (feat/listen: tam-izleme oy kapısı, branch codex/full-verified-listen)
CI'ı yeşilse squash-merge et ve deploy zincirini yürüt.

Bilinen durum (2026-07-17 doğrulandı):
- gh aktif hesabı arfglnddyma-199385 olmalı (filizgulen1966-tech push yetkisiz).
- Vercel deploy HER ZAMAN repo kökünden: `pnpm exec vercel --prod --yes`
  (apps/web içinden atılırsa pnpm-lock pakete girmez → npm "workspace:*" hatası).
- Bu PR'da migration YOK; DB'ye dokunma.
- Mobil dosyalar değişti → merge sonrası yeni EAS APK gerekir:
  apps/mobile'da `npx -y eas-cli@latest build --platform android --profile preview`
  (yerel Gradle bu makinede takılır, EAS kullan). APK'yı iki cihaza kur:
  A56 RFCY90DPCKN + Note20 R58N906QPDF (adb: C:\Users\arfgl\AppData\Local\Android\Sdk\platform-tools\adb.exe).
  Keystore artık aynı → adb install -r yeterli, uninstall GEREKMEZ.

Doğrulama (hepsi geçmeden "bitti" deme):
1. voxscore.app/api/health/ready → 200 {"ready":true}
2. Prod'da kısa bir dinleme (<%90) oy AÇMAMALI; DB'de verified_listens.is_valid=false kalmalı.
   (supabase CLI linkli: vocalleague twrwixownormzussyzse; read-only: pnpm exec supabase db query "...")
3. Tam izleme sonrası oy açılmalı ve performances.duration_s dolmalı (YouTube API cache'i çalışıyor).
4. Opsiyonel backfill: mevcut 60 performansın duration_s'i null — tek seferlik doldurmak istersen
   packages/core/src/youtube.ts:fetchVideoDurationSeconds ile küçük bir script yaz, ÖNCE bana sor.

Rapor formatı: adım adım ne yapıldı + kanıt (komut çıktısı/DB sorgusu) + kalan riskler. Türkçe.
```

---

## P2 — Uzun-video tavanı (ürün kararı + ~10 satır)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Önce oku: packages/core/src/listen.ts, apps/web/src/app/api/listens/complete/route.ts,
PR #64 açıklaması.

Bağlam: Oy kapısı artık güvenilir sürenin %90'ı (MIN_VERIFIED_LISTEN_WATCHED_PCT).
Sorun: 15dk'lık videoda ~13.5dk izleme gerekiyor — oy hacmini öldürür.

Görev: Kapıyı min(%90 × süre, TAVAN) yap. Tavan önerim 180sn (3dk) — benimle netleştir.
- Sabit packages/core'a (örn. MAX_VERIFIED_LISTEN_SECONDS), route + 3 client tetikleyicisi
  (web youtube-player.tsx, mobil performance/[id].tsx, mobil battle.tsx) aynı formülü kullansın.
- validateListen'ın minWatchedPct/minWatchSeconds mimarisini bozma; tavanı route seviyesinde
  effective threshold olarak hesapla.

Test (ölçülebilir): 200sn video → %90=180sn eşik; 600sn video → eşik 180sn
(=%30) kabul, 170sn red; 33sn altı klip yine reddedilir (30sn floor korunur).
pnpm typecheck && pnpm test && pnpm lint geçmeli.

Çıktı: tek commit, PR #64'ün üstüne (branch codex/full-verified-listen) veya ayrı PR — bana sor.
```

---

## P3 — Supabase migration ledger uzlaştırması (Codex #2)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Prod Supabase: vocalleague, ref twrwixownormzussyzse (CLI linkli durumda).

Bağlam (2026-07-17 doğrulandı): supabase/migrations'da 51 dosya var ama prod
schema_migrations tablosunda SADECE 2 kayıt var (20260717090000 + 20260717120000).
Kalan 49 migration geçmişte out-of-band uygulanmış (şema canlı ve doğru çalışıyor,
2330+ performans taraması olan GERÇEK prod verisi var). Bu yüzden düz `db push`
her şeyi yeniden uygulamaya kalkar = tehlikeli.

Görev: Ledger'ı güvenle uzlaştır.
1. ÖNCE fark analizi (read-only): `pnpm exec supabase db diff --linked` ile repo
   migration'larının son durumu vs canlı şema — fark VAR MI raporla.
2. Yedek planı yaz (Supabase dashboard backup veya pg_dump komutu) — ama ÇALIŞTIRMADAN
   önce bana sor.
3. Fark yoksa: 49 versiyonu `pnpm exec supabase migration repair --status applied <v1> <v2> ...`
   ile işaretle. NOT: Bu komut geçen sefer permission classifier'a takıldı — kullanıcı
   onayı aldıktan sonra çalıştır, bulk komutu tek seferde ver.
4. Doğrula: `supabase migration list` → 51/51 Local=Remote eşleşmeli; sonra
   `supabase db push --dry-run` → "no pending migrations" demeli.

KURAL: Prod DB'ye yazan HER adım öncesi benden açık onay al. Read-only analiz serbest.
Rapor: fark analizi çıktısı + uygulanan komutlar + son migration list durumu. Türkçe.
```

---

## P4 — Native attestation'ı prod'da zorunlu kıl (Codex #3)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Önce oku: docs/mobile-native-validation.md, apps/web/src/lib/native-attestation.ts,
apps/web/src/app/api/health/ready/route.ts (attestation env listesi zaten orada).

Bağlam: Kod Play Integrity/App Attest'i destekliyor ama prod'da
NATIVE_ATTESTATION_REQUIRED=true değil; GOOGLE_PLAY_CERT_SHA256, APPLE_TEAM_ID,
APPLE_BUNDLE_ID, APP_ATTEST_ENVIRONMENT env'leri Vercel'de yok
(GOOGLE_PLAY_PACKAGE_NAME + SERVICE_ACCOUNT_JSON_B64 VAR).

Görev (sıralı, her fazda dur ve bana sor):
1. Envanter: hangi endpoint'ler attestation'lı, hangi env'ler eksik, store-signed
   build olmadan nelerin test edilemeyeceğini net listele.
2. EAS production profile ile store-signed AAB build (submit ETME — sadece build).
   Play Console'dan signing cert SHA-256'yı almam için bana adım adım talimat ver
   (ben manuel yapacağım, sen bekle).
3. Env'leri Vercel'e ekleme komutlarını hazırla (değerleri BEN gireceğim; sen
   `vercel env add` komut şablonu ver, secret'ları isteme).
4. Canary: flag'i önce preview environment'ta aç, cihaz matrisi (A56+Note20) ile
   geçerli/bozuk/replay attestation senaryolarını test et; rapor et.
5. Benden onay → prod flag. /api/health/ready eksikleri göstermeli (missing[] zaten kodda).

KURAL: store submission, ücretli işlem, secret değeri isteme YOK. Rapor Türkçe.
```

---

## P5 — Authenticated happy-path E2E CI'a bağla (Codex #4)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Önce oku: apps/web/e2e/api-gates.spec.ts (satır 3-17'deki açıklama), playwright.config.ts,
supabase/config.toml, .github/workflows/ (CI verify job'ı).

Bağlam: Mevcut E2E'ler yalnızca oturumsuz kapıları test ediyor. Gerçek akışlar
(login → ekle → dinle → oyla) CI'da hiç koşmuyor.

Görev: Local Supabase (supabase start) tabanlı seed'li test harness kur ve şu
akışları Playwright ile CI'a bağla:
1. signup/login → YouTube linki ekle → anında provisional skor görünür
   (scoring provider'ı mock'a zorla — OPENAI_API_KEY verme; mock deterministik).
2. Verified Listen: kısa izleme oy AÇMAZ; tam izleme (test videosu yerine
   listens/complete API'sine deterministik event trail POST'la) oy AÇAR → oy → skor değişir.
3. Battle: tek taraf dinlenmişken oy 403; iki taraf → oy geçer.
4. Kendi performansına oy → 403 self_vote_forbidden.
5. Hesap silme → yeniden giriş.

Kısıtlar: YouTube iframe'ini CI'da gerçekten OYNATMAYA çalışma (flaky) — player'ı
değil SUNUCU kapılarını gerçek HTTP + gerçek local DB ile test et. Turnstile'ı
test modu key'iyle geç. Her test bağımsız seed/teardown.

Ölçülebilir hedef: `pnpm test:e2e` lokalde yeşil + CI workflow'a job olarak eklenmiş
+ toplam süre <5dk. Rapor: eklenen dosyalar, CI yaml diff'i, koşum süresi. Türkçe.
```

---

## P6 — Store/privacy/yasal doküman güncellemesi (Codex #5)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Önce oku: docs/store-privacy-disclosures.md, docs/store-listing.md,
apps/mobile/src/app/measure/[performanceId].tsx (mikrofon/WAV kaydı gerçeği),
push token tabloları için supabase/migrations'da notification/push araması yap.

Bağlam (Codex denetimi doğruladı): dokümanlar koddan geride —
- store-privacy-disclosures.md:29 "push token yok" diyor ama tablolar+gönderim var.
- Aynı doküman "mikrofon kullanılmıyor" diyor ama AI Judge WAV kaydediyor.
- store-listing.md:3 destek e-postası hâlâ SUPPORT_EMAIL_REQUIRED placeholder.
- Google Play web-üzerinden-hesap-silme sayfası yok (Play politikası zorunlu).

Görev:
1. İki dokümanı KODUN GERÇEĞİNE göre yeniden yaz (mikrofon: yalnız kullanıcının
   kendi kaydı, cihazda ölçül-analiz, measure-and-delete ADR 0003; push token: var).
2. apps/web'e /account/delete sayfası ekle: login'li kullanıcı hesabını silebilsin
   (mevcut mobil "Hesabı sil" akışının API'sini yeniden kullan; yeni endpoint yazma
   gerekmiyorsa yazma). Google Play Data Safety formunda beyan edilecek URL:
   https://voxscore.app/account/delete
3. Data Safety + Apple Privacy Label için doldurulacak alanları tablo halinde hazırla
   (ben formu manuel dolduracağım).
4. Destek e-postası: benden e-posta adresini SOR, placeholder'ları değiştir.

Sınır: Terms/Privacy/DMCA hukuki inceleme İNSAN işi — sadece "değişen davranışlar"
listesi çıkar, metinleri kendin hukuken onaylama. Test: silme sayfası E2E (login →
sil → yeniden giriş başarısız). Rapor Türkçe.
```

---

## P7 — Analyzer ops temizliği (Codex #7)

```
VoxScore GCP: proje "voxscore" (728420775053), gcloud hesabı filizgulen1966@gmail.com
(aktif config projesi ilil-cilingir-prod — DEĞİŞTİRME, --project voxscore flag'i kullan).
Repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç

Bağlam (2026-07-17): Güncel servis voxscore-analyzer @ europe-west3 rev 00006-6nx
(pipelineVersion 2, /readyz 200). Codex, europe-west1'de ESKİ ikinci bir servis buldu
(/readyz 404). Vercel prod ANALYZER_URL hangi servisi gösteriyor doğrulanmalı.

Görev:
1. `vercel env ls production` ile ANALYZER_URL'in SADECE adını doğrula; değerini
   öğrenmek için tüm env'leri dosyaya DÖKME (geçen sefer classifier engelledi) —
   bunun yerine: gcloud ile iki servisin URL'lerini listele, sonra prod'da bir
   analiz oturumu tetiklenirken Cloud Run request loglarına bak (hangi servis
   trafik alıyor → Vercel onu kullanıyor).
2. west3 trafik alıyorsa: west1 servisini listele/describe et, benden AÇIK ONAY
   iste, onaydan sonra sil.
3. Concurrency: apps/analyzer DSP CPU-yoğun; servisi `--concurrency=1 --max-instances=20`
   olarak güncelle (plan gereksinimi), /readyz'yi tekrar doğrula, bir gerçek analiz
   E2E'si çalıştığını Cloud Run loglarından teyit et.
4. Web readiness: apps/web/src/app/api/health/ready/route.ts'e HAFIF bir analyzer
   kontrolü ekle (ANALYZER_URL tanımlıysa /readyz'ye 2sn timeout'lu fetch; başarısızsa
   ready:false + "analyzer" alanı). Route testini güncelle. Vitest + typecheck + lint yeşil.

Rapor: hangi servis siliniyor + trafik kanıtı + yeni concurrency ayarı + readiness diff. Türkçe.
```

---

## P8 — AI Judge bilimsel doğrulama programı (Codex #6 — uzun vadeli)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç
Önce oku: docs/adr/0003-measured-vocal-scoring.md, packages/dsp/src/ai-judge.ts,
apps/analyzer/src/server.ts, docs/remaining-work.md.

Bağlam: AI Judge pipeline'ı teknik olarak sağlam (YIN, DTW, kalite kapısı,
deterministik testler) ama "adil ve doğrulanmış vokal puanı" iddiası bilimsel
kanıt gerektiriyor. Şu an ai_verified rozetli puanlar üretiyor.

Görev — ÖNCE PLAN, KOD YAZMA: Aşağıdaki program için ayrıntılı, fazlı bir yol
haritası dokümanı yaz (docs/ai-judge-validation-plan.md):
1. Pitch motoru benchmark'ı: açık dataset'lerle (lisansı ticari-uyumlu olanlar;
   Essentia/madmom YASAK — AGPL/non-commercial) YIN doğruluk raporu.
2. ≥50 açık-rızalı benchmark kaydı toplama protokolü (rıza metni + saklama süresi).
3. Liveness challenge tasarımı (kayıt anında rastgele istem) + aynı audio_sha256'nın
   farklı hesaplarda reddi (bu İKİSİ kodlanabilir — ayrı PR'lar olarak kapsamla).
4. Referans melodiler için rights_basis alanı + sürümleme süreci.
5. 300 kayıt × ≥3 bağımsız jüri kalibrasyon çalışması tasarımı (maliyet tahmini dahil).
6. Dil/cihaz/ses-grubu bias analizi + holdout Spearman/MAE hedefleri
   (kabul eşiği öner: örn. Spearman ≥0.7).
7. Bunlar bitene kadar UI'da "beta/ölçüm tahmini" etiketi gereksinimi — hangi
   ekranlarda değişiklik gerektiğini listele.

Kodlanabilir olanlardan (3. madde) İLK PR'ı öner ama benden onay almadan başlama.
Çıktı: plan dokümanı + fazlara bölünmüş PR listesi + insan/dış-kaynak gerektiren işler. Türkçe.
```

---

## P9 — Repo/GitHub temizliği (Codex #7 devamı — küçük)

```
VoxScore repo: C:\Users\arfgl\OneDrive\Desktop\sesi aççç

Görev (hepsi düşük risk ama benden onaysız SİLME yok):
1. tmp/, .codex/, kök tmp_*.png (~270MB yerel artifact): listele, toplam boyutu göster,
   benden onay al, sonra sil. Git'e dokunma (zaten untracked).
2. README.md + .claude/handoff/latest.md: bugünkü gerçek durumla güncelle
   (PR #63 canlı, PR #64 açık, analyzer v2, APK v7).
3. GitHub'da açık PR/issue taraması: gh pr list, gh issue list → #52 ve #46
   superseded mı doğrula (diff'leri main'le karşılaştır); superseded ise kapatma
   YORUMU taslağı hazırla, kapatmayı BEN onaylayınca yap.
4. Prettier'ın .claude/worktrees kopyasını taramaması için .prettierignore'a ekle;
   `pnpm format:check` yeşil olmalı.
5. gh aktif hesabının arfglnddyma-199385 kaldığını doğrula (push yetkili hesap bu).

Rapor: yapılan/onay bekleyen işler tablosu. Türkçe.
```

---

## Sıralama önerisi ve notlar

- **P1 şimdi** (PR #64 CI'ı büyük olasılıkla bitti) → **P2** istersen P1'den önce
  araya girer (aynı branch'e eklenir).
- **P3 kısa ve önemli** — gelecekteki her deploy'u rahatlatır.
- **P5, P4'ten önce de yapılabilir** (bağımsızlar); P4 Play Console erişimi ister.
- **P8 en uzun soluklu** — plan dokümanıyla başlar, acelesi yok.
- Kullanıcıdan **insan işi** gerektirenler: P4 (Play Console cert), P6 (destek
  e-postası + form doldurma + hukuk incelemesi), P8 (jüri/rıza organizasyonu).

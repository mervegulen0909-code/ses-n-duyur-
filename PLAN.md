# VoxScore Gerçek AI Jüri Sistemi - Uygulama Planı

> Durum: Araştırma tamamlandı, uygulama başlamadı  
> Araştırma tarihi: 2026-07-15  
> Hedef: Başka bir AI ajanı bu dosyayı okuyup küçük PR'larla uygulamaya devam edebilsin.  
> Bu plan, YouTube metadata'sından üretilen sayısal puanı ana ürün kabul eden eski yaklaşımın yerini alır.

## 0. Devam edecek ajan için zorunlu başlangıç

- Önce `AGENTS.md`, `HANDOFF-CODEX.md`, `docs/adr/0001-stack-and-hard-constraints.md` ve
  `docs/adr/0003-measured-vocal-scoring.md` dosyalarını oku.
- İlk komutlar `git status --short`, `git branch --show-current` ve `git log -1 --oneline`
  olmalı.
- Bu plan yazılırken çalışma ağacı `main` / `f77f825` üzerinde kirliydi. Kullanıcının mobil,
  verified-listen, otomatik performans ekleme ve ilk puan düzeltme değişiklikleri var. Bunları
  geri alma veya üstüne yazma.
- Özellikle `packages/core/src/listen.ts`, mobil performans ekranı, YouTube oynatıcıları ve
  `supabase/migrations/20260715233500_fix_initial_performance_score.sql` mevcut kullanıcı
  çalışmasıdır.
- Bir seferde bütün planı uygulama. Her faz ayrı issue/branch/PR olmalı. Yeni branch'ler
  `codex/` önekiyle açılmalı.
- Her davranış değişikliğinde önce test yaz. Her yeni tabloda RLS olmalı. Her API girdisi Zod ile
  doğrulanmalı. `service_role` hiçbir istemci paketine girmemeli.
- YouTube sesini/videoyu indirme, ayırma, kopyalama, önbelleğe alma veya analiz etme. Bu kuralın
  etrafından dolaşan servis veya üçüncü taraf API de kullanma.

## 1. Ürün kararı

VoxScore'un ana özelliği gerçekten sesi analiz eden **VoxScore AI Jüri** olacaktır.

1. YouTube başlığı, kanal adı veya altyazısından artık sayısal vokal puanı üretilmeyecek.
2. YouTube yalnızca resmi gömülü oynatıcıyla performansı izleme yüzeyi olarak kalacak.
3. AI puanı yalnızca performans sahibinin uygulamada kaydettiği veya sahipliğini onaylayarak
   gönderdiği ses kaydından üretilecek.
4. Nota doğruluğu ancak sürümlenmiş bir referans melodi bulunduğunda puanlanacak.
5. Referans olmayan kayda teknik ölçüm raporu verilebilir fakat lig puanı verilmeyecek.
6. Kayıt kalitesi sanat puanına eklenmeyecek. Kötü kayıt, düşük sanat puanı yerine
   `tekrar kayıt gerekli` sonucu üretecek.
7. AI ilk açılış puanını verecek. Doğrulanmış kullanıcı oyları geldikçe AI etkisi düzenli olarak
   azalacak; 100 doğrulanmış oyda nihai puan tamamen kullanıcılara geçecek.
8. Her puanın kaynak, sürüm ve güven seviyesi görülebilir olacak.

## 2. Mevcut reponun gerçek durumu

| Alan                    | Şu anda var                                                                                                | Sorun / eksik                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| YouTube ilk puanı       | `apps/web/src/lib/adapters/scoring.ts` metadata + varsa altyazıyı LLM'e gönderiyor                         | Model sesi duymuyor; perde, ritim ve ton tahminleri performans ölçümü değil         |
| Puan oluşturma          | `apps/web/src/lib/performance-create.ts` ve atomik SQL RPC                                                 | Metadata puanı doğrudan `current_score` oluyor ve sıralamaya girebiliyor            |
| Temel DSP               | `packages/dsp` içinde WAV parser, YIN, perde kararlılığı, onset, vibrato, SNR, clipping, spectral centroid | Referans melodi yok; “doğru nota” yerine yalnızca kararlılık vekili ölçülüyor       |
| Ölçüm API'si            | `POST /api/measurements` ham WAV'ı bellekte analiz edip siliyor                                            | Vercel gövde sınırı 4.5 MB; ağır ML yok; doğrudan 0-100'a elle çizilmiş eşikler var |
| Ölçüm tablosu           | `measured_scores` ve süre eşleşmesi alanı                                                                  | Sadece YouTube süresinin ±%5 eşleşmesi, aynı performans olduğunu kanıtlamaz         |
| Mobil kayıt bağımlılığı | `@siteed/audio-studio@3.2.1` ve mikrofon izin metni hazır                                                  | Gerçek kayıt rotası yok; `voxscore-demo.tsx` yalnızca simülasyon                    |
| Topluluk oyu            | Verified listen, öz-oy engeli, günlük limit, trimmed mean                                                  | Geçici eşik `MIN_VERIFIED_LISTEN_SECONDS = 1`; tam dinleme anlamına gelmiyor        |
| Skor harmanı            | AI metadata başlangıcı + oy sayısına göre en fazla `%55` topluluk                                          | Metadata tahmini sonsuza kadar en az `%45` etkide kalıyor                           |
| Kalibrasyon             | Admin anchor ve kriter offsetleri                                                                          | Metadata tahminini gerçek ses ölçümüne dönüştüremez                                 |

Mevcut `packages/dsp` çöpe atılmayacak. WAV doğrulama, temel sinyal özellikleri ve sentetik
testler yeni sistemin kalite kapısı/baseline motoru olarak kullanılacak. Ancak mevcut
`pitchJitterCents -> vocalAccuracy` eşlemesi kaldırılacak; perde kararlılığı nota doğruluğu diye
sunulmayacak.

## 3. Araştırma sonuçları ve mimari etkileri

### 3.1 YouTube sınırı

- YouTube politikası görsel-işitsel içeriğin indirilmesini, önbelleğe alınmasını ve ses/video
  bileşenlerinin ayrılmasını yasaklıyor.
- Oynatıcı reklamlarını değiştirmek veya engellemek yasak. Premium üyeliği ve reklam kararı
  YouTube oynatıcısına bırakılmalı; VoxScore özel reklam atlatma mantığı yazmamalı.
- 1 Haziran 2026'dan beri ek türetilmiş metrikler, özel skorlar ve leaderboard kullanımında
  YouTube'un ilgili politika eki/audit süreci ayrıca incelenmeli. VoxScore puanı kendi ses
  kaydından üretilse de skor YouTube içeriğinin yanında gösterildiği için canlı açılıştan önce
  yazılı uygunluk doğrulaması alınmalı.
- Sonuç: YouTube URL'si analiz girdisi değildir. AI kaydı ile YouTube kaydı iki ayrı veri
  kaynağı olarak açıkça etiketlenir.

### 3.2 Neden mevcut Vercel route'u yeterli değil

- Vercel Function istek gövdesi 4.5 MB ile sınırlı. 16 kHz/mono/PCM16 kayıt dakikada yaklaşık
  1.92 MB olsa da tam şarkı, üst örnekleme oranı ve tekrar denemeler bu sınırı kolayca aşar.
- ML model başlangıcı ve uzun ses analizi web route'unu ağırlaştırır.
- Önerilen hedef: istek bazlı, sıfıra ölçeklenen ayrı bir analiz container'ı. İlk tercih
  Cloud Run'dır: HTTP/1 isteği 32 MiB'a kadar, istek süresi 60 dakikaya kadar desteklenir.
- Bu, mevcut stack'e ek servis olduğu için ilk PR'da ADR 0004 yazılmadan kurulmayacak.

### 3.3 Ses yakalama

- Repoda kurulu `@siteed/audio-studio` Android/iOS'ta tutarlı WAV PCM çıktısı, 16 kHz mono,
  `pcm_16bit`, kayıt süresi sınırı ve yerel dosya URI'si sağlıyor.
- V1 kayıt ayarı: `sampleRate: 16000`, `channels: 1`, `encoding: 'pcm_16bit'`, arka plan kaydı
  kapalı, azami 180 saniye.
- Kayıt uygulama belleğinde/yerel geçici dosyada kalır; analizden sonra `finally` bloğunda yerel
  dosya silinir.

### 3.4 Perde ve referans karşılaştırması

- Mevcut YIN motoru tek sesli, temiz kayıtta iyi bir baseline'dır fakat telefon, nefesli
  başlangıçlar ve eşlik sesi üzerinde tek başına üretim kararı değildir.
- Spotify Basic Pitch Apache-2.0 lisanslıdır, TypeScript/Python sürümleri ve ONNX modeli vardır;
  tek enstrümanda daha iyi çalıştığını kendi dokümantasyonu belirtir. Kuru vokal aday motorudur.
- CREPE MIT lisanslı tek sesli perde modelidir fakat resmi paketinin son sürümü eskidir. Yalnızca
  benchmark adayı olmalıdır.
- Motor seçimi önceden varsayılmayacak. YIN, Basic Pitch ve gerekiyorsa CREPE aynı doğrulanmış
  veri setinde kıyaslanacak.
- Referans ve tahmin, sınırlı Dynamic Time Warping (DTW) ile hizalanacak. Kullanıcının kendi
  ses aralığına transpoze etmesi cezalandırılmayacak; en iyi sabit yarım ses kayması bulunup
  raporlanacak.
- Nota/perde ölçümleri `mir_eval` tanımlarına paralel kurulacak: voicing recall/false alarm,
  25/50/100 cent toleranslarında raw pitch accuracy, octave-aware hata ve note-onset F1.

### 3.5 OpenAI ses modeli

- Güncel OpenAI API ses girdisini destekliyor, fakat resmi kullanım alanları ağırlıkla konuşma,
  transcription ve voice agent senaryoları. Şarkıcılık puanının doğruluğu için resmi garanti yok.
- Ham sesin tek başına bir LLM'e gönderilip “perde 83” dedirtilmesi yasaktır; bu sayı ölçülmüş
  olmaz ve deterministik değildir.
- V1'de LLM yalnızca sürümlenmiş, ölçülmüş özelliklerden açıklama üretir; yeni objektif sayı
  üretemez.
- Ham kaydı bir ses modeline göndererek duygu/yorum değerlendirme deneyi ancak açık kullanıcı
  izni, DPA/retention incelemesi ve bağımsız insan-jüri benchmark'ı sonrasında açılabilir.
- OpenAI API verisi varsayılan olarak model eğitimi için kullanılmasa da bazı endpoint'lerde
  abuse monitoring içeriği 30 güne kadar tutulabilir. “Ses hemen silinir” vaadiyle çelişmemek
  için ham ses, Zero Data Retention onayı olmadan Chat Completions ses modeline gönderilmeyecek.

## 4. Puan türleri ve kullanıcıya gösterilecek durumlar

Veritabanı ve UI aşağıdaki durumları birbirinden ayırmalı:

| `score_status`       | Anlamı                                                 | Sıralamaya girer mi?                       |
| -------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `unscored`           | YouTube performansı var, sahipli ses analizi yok       | Hayır                                      |
| `reference_required` | Kayıt var fakat sürümlenmiş referans melodi yok        | Hayır                                      |
| `analysis_pending`   | Kayıt gönderildi, analiz sürüyor                       | Hayır                                      |
| `quality_rejected`   | Gürültü/clipping/voicing/coverage kapısı geçilemedi    | Hayır                                      |
| `technique_only`     | Referanssız teknik özellik raporu üretildi             | Hayır                                      |
| `ai_verified`        | Referanslı, kalite kapısını geçen gerçek AI Jüri puanı | Evet                                       |
| `legacy_metadata`    | Eski metadata-only puan                                | Hayır; yalnızca geçmiş/audit için saklanır |
| `analysis_failed`    | Teknik hata; puan üretilmedi                           | Hayır                                      |

Kullanıcıya ana etiketler:

- `VoxScore AI Jüri Puanı` - yalnızca `ai_verified`
- `AI analizi bekleniyor` - puansız performans
- `Teknik vokal raporu` - referanssız ölçüm
- `Kayıt uygun değil, tekrar dene` - kalite reddi
- `Topluluk puanı` - doğrulanmış izleyici oyları, ayrı gösterilir

`Provisional AI Estimate` metadata sayısı yeni performanslarda tamamen kaldırılacak. Eski kayıtlar
silinmeyecek; audit ve geri dönüş için `legacy_metadata` olarak saklanacak.

## 5. AI Jüri v1 puan sözleşmesi

### 5.1 Kalite kapısı

Puan hesaplanmadan önce şu kontroller yapılır:

- WAV/PCM başlığı geçerli, mono, 16-bit; desteklenmeyen format reddedilir.
- Süre 20-180 saniye aralığında.
- En az `%30` güvenilir voiced frame.
- Clipping oranı başlangıç eşiğinin altında.
- Tahmini SNR başlangıç eşiğinin üstünde.
- Perde motoru güveni ve referans hizalama kapsamı yeterli.
- Referanslı puan için referans melodinin en az `%80`'i kapsanmış olmalı.
- Çok seslilik/eşlik izi analizi bozuyorsa düşük puan verilmez; kayıt yeniden istenir.

İlk eşikler konfigürasyon olarak tutulur, koda dağılmış sihirli sayılar olmaz. Eşikler insan-jüri
verisiyle doğrulanmadan “kalıcı” kabul edilmez. Güven değeri puanı çarpmaz; ya puan geçerlidir ya
da kalite kapısından dönülür.

### 5.2 Ölçülen alt puanlar

AI Jüri v1 yalnızca ölçülebilir alt puanlardan oluşur:

| Alt puan          | Ağırlık | Kaynak                                                                   |
| ----------------- | ------: | ------------------------------------------------------------------------ |
| `melodyAccuracy`  |   `%35` | Referansa göre cent hatası, raw pitch accuracy, voicing                  |
| `rhythmAccuracy`  |   `%20` | Hizalanmış onset ve nota süresi sapmaları                                |
| `pitchControl`    |   `%15` | Nota içi kararlılık; vibrato trendden ayrılır                            |
| `noteTransitions` |   `%10` | Nota başlangıç/bitiş temizliği ve geçiş sapması                          |
| `sustainControl`  |   `%10` | Uzun notalarda perde ve enerji kararlılığı                               |
| `dynamicPhrasing` |   `%10` | Normalize edilmiş cümle içi dinamik hareket; mutlak ses yüksekliği değil |

```text
aiJudgeScore =
  melodyAccuracy * 0.35 +
  rhythmAccuracy * 0.20 +
  pitchControl * 0.15 +
  noteTransitions * 0.10 +
  sustainControl * 0.10 +
  dynamicPhrasing * 0.10
```

Kurallar:

- Her alt puan 0-100 ve iki ondalıkla saklanır.
- Aynı ses byte'ı + aynı referans sürümü + aynı pipeline sürümü daima aynı sonucu vermeli.
- Vibrato kullanmamak ceza değildir. Vibrato varsa kararlılığı ölçülür.
- Ses aralığı, cinsiyet varsayımı, mutlak perde yüksekliği veya şarkının orijinal tonunda söyleme
  kalite puanı değildir.
- `recordingQuality` sanatsal toplamın parçası değildir; yalnızca kalite kapısıdır.
- `emotionInterpretation`, `originality`, `pronunciationDiction`, `stagePresence` v1 objektif AI
  toplamına girmez. Bunlar sonraki doğrulanmış öznel katman veya topluluk değerlendirmesidir.
- Elle yazılmış lineer eşikler geçici benchmark eşikleridir. Üretim 0-100 dönüşümü, eğitim
  setinden ayrı holdout üzerinde doğrulanan monotonic kalibrasyon ile sürümlenir.

### 5.3 AI başlangıcı ve kullanıcılara tam devir

AI yalnızca güvenilir bir başlangıç noktası oluşturur. İlk doğrulanmış kullanıcı oyuyla devir
başlar ve `FULL_COMMUNITY_VOTES = 100` olduğunda AI'nın `currentScore` üzerindeki etkisi tamamen
sıfırlanır:

```text
FULL_COMMUNITY_VOTES = 100
communityWeight(n) = min(1, n / FULL_COMMUNITY_VOTES)
currentScore = aiJudgeScore * (1 - communityWeight) + listenerScore * communityWeight
```

Örnekler:

| Doğrulanmış oy | Topluluk etkisi | AI etkisi |
| -------------: | --------------: | --------: |
|              0 |            `%0` |    `%100` |
|              1 |            `%1` |     `%99` |
|             10 |           `%10` |     `%90` |
|             25 |           `%25` |     `%75` |
|             50 |           `%50` |     `%50` |
|           100+ |          `%100` |      `%0` |

Topluluk ortalamasında mevcut kriter ağırlıkları, itibar ağırlığı ve 10 oy sonrası alt/üst `%10`
trim korunabilir. Ancak `initial_ai_score` artık metadata puanı değil `ai_judge_score` olmalıdır.
100 oydan sonra AI puanı geçmiş/audit ve karşılaştırma için saklanır fakat nihai puan hesabına
katılmaz. Devir eşiği environment değişkeni değildir; skor rejimiyle birlikte sürümlenen bir
`packages/scoring` sabitidir.

### 5.4 Güven

```text
confidence = min(
  signalQualityConfidence,
  pitchEngineConfidence,
  alignmentConfidence,
  referenceCoverage,
  referenceQualityConfidence
)
```

- `confidence >= 0.75` ve bütün kalite kapıları geçilmişse `ai_verified`.
- `0.50-0.74` arası yalnızca özel teknik rapor; sıralama yok.
- `< 0.50` tekrar kayıt.
- UI tek başına “%82 güven” göstermenin yanında hangi kapının zayıf olduğunu da kodlanmış bir
  neden ile açıklamalı (`too_noisy`, `too_short`, `low_voicing`, `reference_mismatch`, vb.).

## 6. Hedef mimari

```text
Mobil uygulama
  1. POST /api/analysis/sessions
  2. Kısa ömürlü, tek kullanımlık upload token alır
  3. 16 kHz mono PCM16 WAV'ı doğrudan Analyzer'a yollar
                 |
                 v
Cloud Run Analyzer (istek bazlı, scale-to-zero)
  - token + nonce + boyut + WAV doğrulama
  - kalite kapısı
  - pitch engine
  - referans + constrained DTW
  - ham ölçümler ve güven bileşenleri
  - audio byte'larını yazmaz/loglamaz; request bitince yok eder
                 |
                 v
POST /api/internal/analysis-results (HMAC imzalı)
  - Zod doğrulama
  - @voxscore/scoring içinde sürümlü 0-100 kalibrasyon
  - atomik DB finalize RPC
                 |
                 v
Supabase
  - session durumu
  - ham olmayan ölçüm/puan/audit verisi
  - scores.ai_judge_score + current_score
                 |
                 v
Web + mobil sonuç ekranı / leaderboard

YouTube IFrame bu zincirin DIŞINDADIR; yalnızca izleme ve verified-listen içindir.
```

Neden Analyzer doğrudan DB'ye yazmıyor: ilk sürümde worker'a `service_role` vermemek ve skor
matematiğini TypeScript fairness core'da tutmak daha dar yetkili bir tasarımdır. Worker sonucu
HMAC ile internal callback'e yollar. Callback başarısızsa worker aynı `session_id` ile idempotent
olarak en fazla üç kez dener.

## 7. Veri modeli

İlk migration önerisi: `supabase/migrations/20260716090000_ai_judge_v1.sql`.

### 7.1 `song_references`

- `id uuid primary key`
- `song_id uuid references songs`
- `version integer`
- `status text check (draft, ready, retired)`
- `format text check (normalized_json, midi, musicxml)`
- `melody jsonb` - normalize edilmiş `{pitch_midi,start_ms,duration_ms}` notaları
- `tempo_bpm numeric null`
- `time_signature text null`
- `rights_basis text` - neden bu referans tutulabilir
- `source_note text` - gizli admin açıklaması; herkese açık değil
- `checksum text`
- `created_by uuid`
- `created_at`, `updated_at`
- `unique(song_id, version)`

RLS: public yalnızca `ready` satırların güvenli view'ını okuyabilir. Tam kaynak/provenance admin
ile sınırlı olmalı. Referans audio hiçbir zaman bu tabloya veya Storage'a konmaz.

### 7.2 `analysis_sessions`

- `id uuid primary key`
- `performance_id uuid references performances`
- `user_id uuid references profiles`
- `reference_id uuid null references song_references`
- `mode text check (song_reference, technique_test)`
- `status text check (created, uploading, processing, completed, rejected, failed, expired)`
- `challenge_nonce_hash text`
- `token_jti text unique`
- `client_platform text`
- `audio_sha256 text null`
- `pipeline_version integer`
- `error_code text null`
- `expires_at`, `started_at`, `completed_at`, `created_at`

RLS: kullanıcı yalnızca kendi session'ını okuyabilir/başlatabilir; durum ve sonuç alanlarını
yalnızca server günceller. Aynı kullanıcı/performans için tek aktif session partial unique index.

### 7.3 `analysis_results`

- `id uuid primary key`
- `session_id uuid unique references analysis_sessions`
- `performance_id uuid references performances`
- `reference_id uuid null`
- `pipeline_version integer`
- `pitch_engine text`
- `pitch_engine_version text`
- `quality_gate jsonb`
- `raw_metrics jsonb` - cent/onset/coverage gibi sesin kendisi olmayan sayılar
- `measured_breakdown jsonb`
- `ai_judge_score numeric(5,2) null`
- `confidence numeric(4,3)`
- `feedback jsonb null`
- `created_at`

RLS: ayrıntılı ham metrikleri yalnızca kayıt sahibi ve admin görür. Herkese açık UI doğrudan bu
tabloyu okumaz; güvenli alanları `scores` veya sınırlı bir view üzerinden okur.

### 7.4 `scores` değişiklikleri

- `score_status text not null default 'unscored'`
- `score_source text not null default 'none'`
- `ai_judge_score numeric(5,2) null`
- `ai_judge_confidence numeric(4,3) null`
- `analysis_result_id uuid null`
- Eski `initial_ai_score`, `ai_breakdown`, provider/model alanları migration sürecinde korunur.

Atomik `finalize_ai_analysis(...)` RPC:

1. Session satırını kilitler.
2. `token_jti`/durum/idempotency kontrol eder.
3. Sonucu ekler.
4. `scores` alanlarını ve topluluk harmanını günceller.
5. Session'ı `completed` veya `rejected` yapar.
6. Aynı callback tekrar gelirse aynı sonucu döndürür, çift kayıt üretmez.

## 8. API sözleşmeleri

### 8.1 `POST /api/analysis/sessions`

Girdi:

```json
{
  "performanceId": "uuid",
  "mode": "song_reference"
}
```

Kontroller: auth, performans sahibi, aktif performans, rate limit, attestation/Turnstile, hazır
referans, aynı anda tek session.

Çıktı:

```json
{
  "sessionId": "uuid",
  "uploadUrl": "https://analyzer.example/analyze",
  "uploadToken": "short-lived-jwt",
  "expiresAt": "ISO-8601",
  "recording": {
    "sampleRate": 16000,
    "channels": 1,
    "encoding": "pcm_16bit",
    "maxSeconds": 180
  }
}
```

Token: `iss`, `aud=voxscore-analyzer`, `sub=user_id`, `session_id`, `performance_id`, `jti`,
`reference_checksum`, `exp <= 10 dakika`. Analyzer public internete açık olsa bile imzasız,
süresi geçmiş veya tekrar kullanılan token'ı reddeder.

### 8.2 `POST /analyze` (Analyzer)

- `Authorization: Bearer <uploadToken>`
- `Content-Type: audio/wav`
- `X-VoxScore-Audio-SHA256`
- Ham body; base64 veya JSON içine ses koyulmaz.
- Azami 12 MiB ve 180 saniye.
- Başarılı kabul `202`; mobil session durumunu poll eder.

### 8.3 `GET /api/analysis/sessions/:id`

Yalnız session sahibi. `status`, güvenli ilerleme yüzdesi, `errorCode` ve tamamlandıysa sonuç
özetini döndürür. Ham özellik veya secret döndürmez.

### 8.4 `POST /api/internal/analysis-results`

Sadece Analyzer HMAC imzası. Timestamp + body SHA-256 replay koruması. Zod şeması `packages/core`
içinde ortak tutulur. İstemci bu endpoint'i çağırarak puan üretemez.

## 9. Uygulama fazları

### Faz P0 - Kararı sabitle, canlı riski kapat

**Amaç:** Kod yazılmadan önce yeni rejimi ve dış servis kararını onaylanabilir hale getirmek.

- [ ] `docs/adr/0004-ai-judge-analysis-worker.md` yaz: Cloud Run Analyzer, user-owned audio,
      direct request, no audio storage, callback, neden Vercel route'u yeterli değil.
- [ ] YouTube ek politika/audit gerekliliğini `docs/youtube-compliance.md` içinde operatör görevi
      olarak kaydet. Bu hukuki tavsiye değil; canlı açılış kapısıdır.
- [ ] `AI_JUDGE_ENABLED=false` ve `METADATA_SCORING_ENABLED=false` feature flag sözleşmesini
      `.env.example` içine ekle.
- [ ] Yeni performanslarda metadata skorunun leaderboard'a girmesini feature flag ile kapatan
      dar bir PR hazırla. Eski kayıtları bu fazda silme.
- [ ] `SCORING_VERSION` bu fazda artırılmayacak; yeni skor matematiği canlı değildir.

**Test:** Metadata scoring kapalıyken performans atomik olarak oluşturulur, `score_status=unscored`
olur ve kullanıcı hatalı 500 görmez.

### Faz P1 - Domain sözleşmesi ve saf puan matematiği

**Dosyalar:**

- Yeni: `packages/scoring/src/ai-judge.ts`
- Yeni: `packages/scoring/src/ai-judge.test.ts`
- Yeni: `packages/core/src/analysis.ts`
- Yeni: `packages/core/src/analysis.test.ts`
- Değiştir: ilgili `index.ts` export'ları

- [ ] Alt puan tipleri, kalite nedeni enum'ları ve sürüm sabitlerini ekle.
- [ ] `FULL_COMMUNITY_VOTES`, `composeAiJudgeScore`, `communityWeightForAiJudge` ve
      `composeFinalAiJudgeScore` sözleşmelerini saf ve deterministik yaz.
- [ ] Eksik/NaN/sınır dışı değerleri reddet; sessizce 50'ye düşme.
- [ ] Analyzer result Zod şeması, session şemaları ve durum geçişlerini ekle.
- [ ] SQL formülüyle parity testi için sabit fixture tablosu oluştur.

**Kabul:** `packages/scoring` testlerinde ağırlık toplamı tam 1; 0/1/10/25/50/100/1000 oy örnekleri;
aynı girdi aynı byte-level JSON sonucunu verir.

### Faz P2 - Veritabanı ve atomik finalize

**Dosyalar:**

- Yeni migration: `supabase/migrations/20260716090000_ai_judge_v1.sql`
- Değiştir: `packages/db/src/types.ts` yalnız `pnpm db:types` ile
- Test: yeni SQL parity/integrity testleri

- [ ] Bölüm 7'deki tabloları, check constraint'leri, index'leri ve RLS politikalarını ekle.
- [ ] `finalize_ai_analysis` security definer RPC yaz; `search_path` sabitle; public execute revoke.
- [ ] Analyzer callback'in kullanacağı server-only RPC çağrısını ekle.
- [ ] `scores` için legacy uyumluluk alanlarını koru.
- [ ] `analysis_results.raw_metrics` public select politikasına açılmayacak.
- [ ] Migration rollback notunu dosya yorumunda yaz; veri silen rollback kullanma.

**Kabul:** Kullanıcı başka kullanıcının session/result detayını okuyamaz; anon finalize edemez;
aynı sonuç iki kez gönderilince tek satır oluşur.

### Faz P3 - Pitch motoru benchmark spike'ı

**Bu faz sonuç üretir, henüz canlı servis üretmez.**

**Dosyalar:**

- Yeni: `experiments/pitch-engine/README.md`
- Yeni: `experiments/pitch-engine/*`
- Fixture'lar: yalnız sentetik, açık lisanslı veya açık rızalı şirket içi kayıtlar

- [ ] YIN baseline, Basic Pitch ve gerekirse CREPE için aynı 16 kHz mono giriş adapter'ını yaz.
- [ ] Sentetik sabit nota, glissando, vibrato, sessizlik ve gürültü fixture'larını çalıştır.
- [ ] En az 50 açık rızalı insan kaydında elle doğrulanmış pitch contour/note referansı oluştur.
- [ ] Median cent error, 50-cent RPA, voicing F1, onset F1, CPU süresi ve peak memory ölç.
- [ ] Android telefon mikrofonları, kadın/erkek ses aralıkları, Türkçe ünlü/ünsüz başlangıçları ve
      kontrollü vibrato örneklerini dengeli kapsa.
- [ ] Sonucu `experiments/pitch-engine/RESULTS.md` içine gerçek tabloyla yaz.

**Seçim kapısı:** Üretim motoru holdout'ta YIN'den anlamlı biçimde iyi olmalı, lisansı ticari
kullanıma uygun olmalı ve CPU container'da 180 saniyelik kaydı kabul edilebilir sürede işlemeli.
Model kazanmazsa sırf “AI” etiketi için eklenmez; YIN + dürüst DSP ile devam edilir.

### Faz P4 - Analyzer servisi

Önerilen ilk yol Node/TypeScript Cloud Run container'ıdır. Benchmark yalnız Python motorunun
belirgin üstün olduğunu gösterirse ADR 0004 güncellenerek Python 3.11 servis seçilebilir.

**Dosyalar:**

- Yeni: `apps/analyzer/package.json`
- Yeni: `apps/analyzer/src/server.ts`
- Yeni: `apps/analyzer/src/auth.ts`
- Yeni: `apps/analyzer/src/analyze.ts`
- Yeni: `apps/analyzer/src/callback.ts`
- Yeni: `apps/analyzer/Dockerfile`
- Yeni: `apps/analyzer/README.md`

- [ ] `/healthz` ve `/analyze` ekle.
- [ ] Streaming body boyut limiti uygula; body tamamlandıktan sonra kontrol etme hatasına düşme.
- [ ] JWT doğrulama, tek kullanımlık `jti`, content hash ve session expiry kontrolü ekle.
- [ ] Audio byte'larını dosya/log/APM/error içine yazma. Temp dosya gerekiyorsa `finally` ile sil.
- [ ] Kalite kapısı ve seçilen pitch adapter'ını ekle.
- [ ] Constrained DTW, transposition search ve ham metrik üretimini ekle.
- [ ] Callback HMAC, timestamp ve üç denemeli exponential backoff ekle.
- [ ] Container `concurrency=1`, request-based billing, min instance 0, max instance maliyet sınırı,
      timeout başlangıçta 300 saniye.

**Test:** bozuk WAV, zip bomb benzeri büyük body, sahte token, replay, düşük ses, clipping, timeout,
callback retry ve temp cleanup. Test loglarında audio/base64 bulunmadığını doğrula.

### Faz P5 - Referans melodi sistemi

**Dosyalar:**

- Yeni: `packages/core/src/song-reference.ts`
- Yeni: `apps/web/src/app/api/admin/song-references/route.ts`
- Yeni: `apps/web/src/app/admin/song-references/page.tsx`
- Yeni: MIDI/MusicXML parser adapter'ları ve testleri

- [ ] Admin MIDI/MusicXML yükler; server normalize edilmiş nota JSON'u üretir.
- [ ] Referans checksum ve version oluşturulur; yayınlanan sürüm sonradan yerinde değiştirilmez.
- [ ] Basit sentez önizlemesiyle nota başlangıçları admin tarafından kontrol edilir.
- [ ] `rights_basis` zorunlu; kaynağı belirsiz referans `ready` olamaz.
- [ ] İlk pilot katalog 5-10 izinli/public-domain/özgün melodiyle sınırlı tutulur.
- [ ] Ticari şarkı melodisi/lyrics saklama hakkı hukuk kontrolünden geçmeden katalog genişletilmez.

**Kabul:** Aynı performans eski referans sürümüyle yeniden hesaplandığında eski sonuç korunur;
yeni sürüm yeni analysis session gerektirir.

### Faz P6 - Mobil gerçek kayıt akışı

**Dosyalar:**

- Yeni: `apps/mobile/src/app/measure/[performanceId].tsx`
- Yeni: `apps/mobile/src/lib/analysis-api.ts`
- Yeni: `apps/mobile/src/lib/recording.ts`
- Değiştir: `apps/mobile/src/app/performance/[id].tsx`
- Değiştir: i18n dosyaları ve typed routes

- [ ] `@siteed/audio-studio` ile 16 kHz/mono/PCM16 kayıt yap.
- [ ] Akış: sahiplik/onay -> mikrofon izni -> giriş seviyesi kontrolü -> kayıt -> ön kalite
      kontrolü -> upload -> processing -> sonuç.
- [ ] Server'ın verdiği azami süreyi kullan; istemci sabitine güvenme.
- [ ] Pause/resume, telefon araması, uygulama background, Bluetooth kopması ve izin reddi durumlarını
      yönet.
- [ ] Upload progress ve iptal ekle. İptalde session server'da `expired/cancelled` olur.
- [ ] Başarı, hata ve iptalde yerel WAV dosyasını `finally` içinde sil.
- [ ] Dosya seçiciyi v1'de açma; ligde replay/sahiplik riskini azaltmak için uygulama içi kayıtla başla.
- [ ] App Attest/Play Integrity doğrulamasını session başlangıcında zorunlu kıl.

**Fiziksel cihaz kabulü:** Note20 Ultra ve en az bir iPhone'da izin, 30/90/180 saniye kayıt,
incoming call, ekran kilidi, upload retry ve yerel dosya silme test edilir.

### Faz P7 - Liveness ve sahiplik koruması

- [ ] Session başında server rastgele üç notalı kısa bir challenge üretir ve hash'ini token'a koyar.
- [ ] Kullanıcı performanstan önce bu kalıbı söyler; analyzer ilk segmentte nota sırasını doğrular.
- [ ] Challenge sonucu sanatsal puana girmez; yalnız kaydın session sırasında üretildiğine dair
      anti-replay sinyalidir.
- [ ] Aynı audio SHA-256 farklı kullanıcı veya performansta tekrar kullanılırsa otomatik puanlama
      durdurulur ve moderasyon flag'i açılır.
- [ ] Liveness başarısızlığı kullanıcıyı “kötü şarkıcı” diye puanlamaz; tekrar kayıt ister.

Bu mekanizma kusursuz kimlik kanıtı değildir. UI yalnız “uygulamada kaydedildi” diyebilir;
“şarkıcının kimliği biyometrik olarak doğrulandı” diyemez.

### Faz P8 - Açıklanabilir geri bildirim

- [ ] Ölçüm motoru her alt puan için evidence üretir: örneğin median cent error, zorlanan zaman
      aralıkları, onset sapması, sustain drift.
- [ ] LLM'e ham audio değil, yalnız sürümlü özellik JSON'u gönder.
- [ ] Structured Output şeması: `summary`, `strengths[]`, `improvements[]`, `practiceTips[]`.
- [ ] Prompt, ölçülmeyen şeyi iddia etmeyi ve yeni sayı üretmeyi açıkça yasaklar.
- [ ] Model/provider hata verirse puan kaybolmaz; sadece metinsel geri bildirim `unavailable` olur.
- [ ] Türkçe geri bildirim Türkçe üretilir; kriter kodları dil bağımsız saklanır.

Ham sesle öznel AI deneyimi ayrı feature flag olmalı ve skor rejimine dahil edilmemeli. En az üç
insan jüriyle korelasyon, test-tekrar güvenilirliği ve OpenAI ZDR/retention şartı geçmeden canlıya
açılmamalı.

### Faz P9 - Skor rejimi v5 ve UI geçişi

**Dosyalar:**

- Değiştir: `packages/core/src/adapters/scoring-provider.ts`
- Değiştir: `packages/scoring/src/score.ts`, SQL RPC ve parity testleri
- Değiştir: web/mobil performance, home, leaderboard, battle ve share-card sorguları

- [ ] `SCORING_VERSION = 5` yalnız gerçek AI finalize zinciri hazırken artırılır.
- [ ] Yeni performansta metadata provider çağrısını kaldır; şarkı metadata çıkarımı devam edebilir.
- [ ] `current_score` yalnız `ai_verified` performansta oluşur.
- [ ] Leaderboard/battle/lig puan sorguları `score_status='ai_verified'` filtresi kullanır.
- [ ] Eski metadata satırlarını `legacy_metadata` işaretle; sayıyı silme.
- [ ] UI'da AI Jüri, ölçülen alt puanlar, güven, pipeline sürümü ve topluluk puanı ayrı gösterilir.
- [ ] Share-card kesin olmayan veya teknik-only puanı “AI doğrulandı” diye paylaşamaz.
- [ ] AI'dan kullanıcılara 0-100 oy arasında tam devir formülü SQL ve TS parity testiyle
      kilitlenir.

**Geri dönüş:** Feature flag kapanınca yeni analysis session açılmaz; mevcut doğrulanmış skorlar
salt okunur kalır. Legacy metadata skorlarını otomatik geri getirme.

### Faz P10 - Verified listen'i yeniden gerçek hale getir

- [ ] Geçici `MIN_VERIFIED_LISTEN_SECONDS = 1` kaldırılır.
- [ ] Server en az `%90` kapsama, server wall-clock, seek/event trail ve bilinen video süresi
      kontrollerini birlikte zorunlu kılar.
- [ ] UI metni açık olur: “Puan vermek için performansı sonuna kadar dinlemeye devam et.”
- [ ] YouTube reklam süresi performans izleme süresine eklenmez; reklam tespiti/atlatma yazılmaz.
- [ ] Premium kullanıcı için VoxScore reklam kararı vermez; resmi player davranışı korunur.
- [ ] Web ve mobilde ended, pause/resume, seek, background ve embed-blocked testleri eklenir.

Bu faz topluluk puanının güvenilirliği için v5 açılmadan önce tamamlanmalıdır.

### Faz P11 - Kalibrasyon ve bağımsız doğrulama

Canlı lig puanı aşağıdaki veri kapısı geçilmeden açılmaz:

- [ ] En az 300 açık rızalı kayıt.
- [ ] Her kayıt için birbirinden bağımsız en az 3 vokal eğitmeni/jüri.
- [ ] Türkçe dahil farklı diller, kadın/erkek ses aralıkları, yaş grupları, telefon markaları,
      oda gürültüsü ve şarkı zorluğu dengeli örneklenir.
- [ ] Train/calibration/holdout şarkıcı bazında ayrılır; aynı şarkıcı iki tarafa sızmaz.
- [ ] Ham metrik -> 0-100 dönüşümleri monotonic kalibrasyonla öğrenilir ve JSON artifact olarak
      sürümlenir. Runtime'da eğitim yapılmaz.
- [ ] Jüriler arası tutarlılık (ICC), model-jüri Spearman, MAE, pairwise ranking accuracy,
      test-tekrar farkı ve cihazlar arası fark raporlanır.
- [ ] Alt grup hata farkları raporlanır; ses tipi/dil/cihaz grubunda sistematik ceza varsa canlı
      açılmaz.

Başlangıç kabul hedefleri, veri görülünce ADR ile kesinleştirilmek üzere:

- İnsan jüri medyanıyla Spearman `>= 0.75`
- Genel MAE `<= 8` puan
- Aynı dosyada deterministik fark `0`
- Aynı take'ın desteklenen iki cihaz kaydında medyan fark `<= 5` puan
- Holdout kalite reddi false-positive oranı `<= %10`
- En kötü izlenen alt grupta MAE, genel MAE'den `> 3` puan kötü olmamalı

Hedef geçilmezse ağırlıkları gizlice değiştirme; pipeline sürümünü artır, raporu sakla ve tekrar
doğrula.

### Faz P12 - Deploy ve kademeli açılış

Sıra:

1. DB migration + web deploy, feature flag kapalı.
2. Analyzer container deploy, secret'lar ve health check.
3. Internal callback ve sentetik production smoke.
4. Mobil development build, şirket içi hesaplar.
5. `shadow` mod: sonuç hesaplanır ama leaderboard'a girmez.
6. İnsan jüri benchmark ve güvenlik/privacy kontrolü.
7. `%5` kullanıcı canary.
8. `%25`, `%50`, `%100`; her aşamada hata, süre, maliyet ve skor dağılımı kontrolü.

Canary durdurma koşulları:

- Audio silme/retention ihlali şüphesi
- Analyzer hata oranı `%5` üstü
- P95 analiz süresi 60 saniye üstü
- Aynı girdi deterministik değil
- Alt grup veya cihaz kaynaklı belirgin skor sapması
- Yetkisiz session/result erişimi

## 10. Test matrisi

### Saf birim testleri

- WAV parser ve fuzz/property testleri
- Pitch contour, cent dönüşümü, octave hata ayrımı
- Constrained DTW ve transposition
- Alt puan kalibrasyonu
- AI başlangıcından 100 oyda tam kullanıcı puanına geçiş ve SQL parity
- Güven/quality reason state machine

### Entegrasyon

- Session oluşturma -> signed upload -> callback -> atomik finalize
- Replay/token expiry/body size/hash mismatch
- Analyzer callback retry/idempotency
- RLS owner/other/anon/admin matrisi
- Eski metadata satırlarının sıralamadan çıkarılması

### E2E

- Mobil gerçek kayıt -> analiz -> sonuç -> leaderboard
- Kalitesiz kayıt -> puan yok -> yeniden kayıt
- Referans yok -> technique-only/reference-required
- Tam verified listen -> oy -> kademeli devir -> 100 oyda `%100` kullanıcı puanı
- Self-vote ve duplicate vote engeli

### Fiziksel cihaz

- Note20 Ultra `SM-N985F`
- En az bir düşük seviye Android
- En az bir iPhone
- Dahili mikrofon, kablolu kulaklık, Bluetooth, sessiz/gürültülü oda

## 11. Güvenlik, gizlilik ve kötüye kullanım

- Ses kişisel veridir. Açık amaç/onay, saklama süresi ve silme davranışı Privacy/Terms içinde
  gerçek altyapıyla birebir aynı olmalı.
- “Hemen silinir” ancak hiçbir kalıcı storage, APM body capture, crash dump veya üçüncü taraf
  retention yoksa söylenebilir.
- Analyzer access log'ları body, query token, audio hash'in tamamı veya feature contour içermez.
- Upload token kısa ömürlü, tek kullanımlık, dar audience ve session'a bağlı olmalı.
- Analyzer yalnız WAV kabul eder; MIME'a güvenmeyip header parse eder.
- Maksimum byte, süre, sample count, frame count, CPU timeout ve memory limit birlikte uygulanır.
- Kullanıcı yalnız kendi performansına analiz bağlayabilir.
- Aynı kayıt tekrar kullanımı ve aşırı session hızı moderasyon sinyalidir.
- Model artifact checksum'u image build sırasında doğrulanır; lisans dosyası image/repo içinde
  tutulur.
- Çocuk kullanıcılar, biyometrik iddia, ses klonlama ve ses verisinin model eğitimi için kullanımı
  ayrı hukuk/privacy onayı olmadan eklenmez.

## 12. Gözlemlenebilirlik ve maliyet

Kaydedilecek metrikler, audio içermeden:

- `analysis_session_created`
- `analysis_upload_started/completed`
- `analysis_quality_rejected` + reason code
- `analysis_completed` + pipeline/pitch engine version
- `analysis_failed` + güvenli error code
- süre, byte boyutu, CPU zamanı, peak memory, callback retry
- skor dağılımı ve güven dağılımı; kullanıcı kimliği yerine aggregate

Dashboard:

- Success/error/quality-reject oranı
- P50/P95 upload ve analiz süresi
- Ortalama maliyet / başarılı analiz
- Cihaz/OS/dil bazında aggregate kalite reddi ve skor sapması
- Pipeline sürüm dağılımı

## 13. Ortam değişkenleri

Web/server:

```text
AI_JUDGE_ENABLED=false
METADATA_SCORING_ENABLED=false
ANALYZER_URL=
ANALYZER_TOKEN_PRIVATE_KEY=
ANALYZER_CALLBACK_SECRET=
AI_FEEDBACK_MODEL=
```

Analyzer:

```text
VOXSCORE_API_BASE_URL=
ANALYZER_TOKEN_PUBLIC_KEY=
ANALYZER_CALLBACK_SECRET=
PIPELINE_VERSION=1
PITCH_ENGINE=
PITCH_ENGINE_MODEL_PATH=
MAX_AUDIO_BYTES=12582912
MAX_AUDIO_SECONDS=180
```

Private key yalnız web server'da, public key Analyzer'da. Callback secret yalnız iki server
ortamında. Mobilde sadece `EXPO_PUBLIC_API_BASE_URL` bulunur.

## 14. İlk uygulanacak PR'ın kesin kapsamı

İlk ajan yalnız **P0 + P1'in sözleşme kısmını** yapmalı:

1. Kirli çalışma ağacını incele ve kullanıcı değişikliklerini koru.
2. `codex/ai-judge-contract` branch'ini ancak mevcut çalışmalar güvenli şekilde ayrıldıktan sonra
   aç.
3. ADR 0004'ü ekle.
4. `packages/scoring/src/ai-judge.ts` ve testlerini ekle.
5. `packages/core/src/analysis.ts` Zod sözleşmelerini ekle.
6. Henüz DB migration, Analyzer deploy, metadata backfill veya UI değişikliği yapma.
7. Şunları çalıştır:

```bash
pnpm exec vitest run packages/scoring packages/core
pnpm typecheck
pnpm lint
pnpm format:check
```

PR kabulü: Sadece yeni, saf sözleşme/matematik ve ADR; mevcut canlı davranış değişmez.

## 15. Tamamlanma tanımı

Sistem ancak aşağıdakilerin tamamı doğruysa “gerçek AI puanlama kuruldu” sayılır:

- [ ] Sayısal AI puanı gerçek, kullanıcıya ait ses byte'larından türetiliyor.
- [ ] YouTube audio/video hiçbir adımda analiz edilmiyor veya indirilmiyor.
- [ ] Nota doğruluğu sürümlü referans melodiye dayanıyor.
- [ ] Kalitesiz/belirsiz kayda düşük puan yerine puansız tekrar sonucu veriliyor.
- [ ] Aynı girdi/pipeline/reference tamamen deterministik.
- [ ] Puanın her alt kriteri ölçüm kanıtına bağlanabiliyor.
- [ ] Metadata-only eski puanlar ligden çıkarılmış.
- [ ] AI 0 oyda başlangıç puanının `%100`'ünü oluşturuyor; doğrulanmış oylarla etkisi azalıyor
      ve 100 oyda nihai puan tamamen kullanıcılara geçiyor.
- [ ] Verified listen tekrar gerçek tam dinleme eşiğinde.
- [ ] Ses hiçbir kalıcı storage/log/backup zincirine girmiyor.
- [ ] İnsan jüri holdout hedefleri ve cihaz/alt grup kontrolleri geçilmiş.
- [ ] Note20 + Android + iPhone E2E tamamlanmış.
- [ ] YouTube audit/politika ve Privacy/Terms operatör onayı tamamlanmış.

## 16. Araştırma kaynakları

Erişim/inceleme tarihi 2026-07-15. Uygulamaya başlanırken değişebilecek limit ve politikalar
tekrar doğrulanmalıdır.

- YouTube Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube derived metrics/data storage policy:
  https://developers.google.com/youtube/terms/derived-metrics-policy
- YouTube policy revision history: https://developers.google.com/youtube/terms/revision-history
- Vercel 4.5 MB function body limit:
  https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- Cloud Run quotas and 32 MiB HTTP/1 limit: https://cloud.google.com/run/quotas
- Cloud Run request timeout: https://cloud.google.com/run/docs/configuring/request-timeout
- Cloud Run request-based billing:
  https://cloud.google.com/run/docs/configuring/billing-settings
- Expo audio recording: https://docs.expo.dev/versions/latest/sdk/audio/
- `@siteed/audio-studio`: https://github.com/deeeed/audiolab
- Spotify Basic Pitch TypeScript (Apache-2.0): https://github.com/spotify/basic-pitch-ts
- Spotify Basic Pitch Python/model (Apache-2.0): https://github.com/spotify/basic-pitch
- CREPE pitch tracker (MIT): https://github.com/marl/crepe
- `mir_eval` melody metrics: https://mir-eval.readthedocs.io/latest/api/melody.html
- Singing Ability Assessment research:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11289018/
- OpenAI audio guide: https://developers.openai.com/api/docs/guides/audio
- OpenAI API data controls/retention:
  https://developers.openai.com/api/docs/guides/your-data

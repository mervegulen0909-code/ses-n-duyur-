#!/usr/bin/env node
/**
 * Play Store ekran görüntülerini Google Play Android Publisher API ile yükler.
 *
 * Neden var: Play Console'un dosya seçicisi tarayıcı otomasyonuna kapalı ve
 * elle yükleme 3 cihaz tipi x N dil = onlarca sürükle-bırak demek. API ile
 * tek komut.
 *
 * Sıfır bağımlılık — Node 18+ (fetch + crypto yerleşik).
 *
 * KURULUM (bir kez):
 *   1. Play Console -> Kurulum -> API erişimi -> servis hesabı oluştur
 *   2. Google Cloud'da o servis hesabına JSON anahtar ürettir
 *   3. Play Console'da servis hesabına uygulama için yetki ver
 *      (en az "Uygulama bilgilerini düzenle ve yayınla")
 *
 * KULLANIM:
 *   # önce ne yapacağını göster (hiçbir şey değiştirmez)
 *   node scripts/play-upload-screenshots.mjs --key ~/play-sa.json
 *
 *   # gerçekten uygula
 *   node scripts/play-upload-screenshots.mjs --key ~/play-sa.json --apply
 *
 * DİKKAT: --apply, ilgili dil+cihaz tipindeki MEVCUT ekran görüntülerini
 * SİLİP yerine bunları koyar. Amaç bu (mağazadaki hatalı görselleri temizlemek)
 * ama geri alınamaz — önce dry-run çıktısını oku.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { join, resolve, basename, extname } from 'node:path';

const PACKAGE_NAME = 'com.voxscore.app';

/** Kaynak klasörler: dosya adları yükleme sırasını belirler (01-, 02-, ...). */
const SOURCES = [
  { locale: 'en-US', dir: 'tmp/store-upload/en-US' },
  { locale: 'tr-TR', dir: 'tmp/store-upload/tr-TR' },
];

/** Aynı görsel seti her cihaz tipine yüklenir; Play her birini ayrı ister. */
const IMAGE_TYPES = ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'];

const API = 'https://androidpublisher.googleapis.com';
const UPLOAD_API = 'https://androidpublisher.googleapis.com/upload';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}
const APPLY = process.argv.includes('--apply');
const KEY_PATH = arg('--key');

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Servis hesabı JSON'undan OAuth2 access token üretir (JWT bearer akışı). */
async function getAccessToken(keyFile) {
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  if (!key.client_email || !key.private_key) {
    die(`${keyFile} bir servis hesabı anahtarı değil (client_email/private_key yok).`);
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key, 'base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok) die(`Token alınamadı: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function api(token, method, path, { body, headers } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  });
  const text = await res.text();
  if (!res.ok) die(`${method} ${path} -> ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

function listImages(dir) {
  const abs = resolve(process.cwd(), dir);
  if (!existsSync(abs)) die(`Klasör yok: ${abs}`);
  const files = readdirSync(abs)
    .filter((f) => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort(); // 01-, 02-, ... sırası yükleme sırasıdır
  if (files.length === 0) die(`Klasörde görsel yok: ${abs}`);
  return files.map((f) => join(abs, f));
}

async function main() {
  if (!KEY_PATH) {
    die(
      'Servis hesabı anahtarı gerekli.\n' +
        '  node scripts/play-upload-screenshots.mjs --key /yol/play-sa.json [--apply]',
    );
  }

  // Önce ne yapılacağını göster — dry-run'da API'ye hiç dokunmuyoruz.
  console.log(`\nPaket: ${PACKAGE_NAME}`);
  console.log(
    `Mod:   ${APPLY ? 'UYGULA (mevcut görseller silinecek)' : 'DRY-RUN (değişiklik yok)'}\n`,
  );

  const plan = SOURCES.map((s) => ({ ...s, files: listImages(s.dir) }));
  for (const { locale, files } of plan) {
    console.log(`  ${locale}  (${files.length} görsel)`);
    files.forEach((f, i) => console.log(`    ${String(i + 1).padStart(2, '0')}. ${basename(f)}`));
    console.log(`    -> ${IMAGE_TYPES.join(', ')}`);
    console.log();
  }

  const totalUploads = plan.reduce((n, p) => n + p.files.length * IMAGE_TYPES.length, 0);
  console.log(`Toplam ${totalUploads} yükleme.\n`);

  if (!APPLY) {
    console.log('Uygulamak için aynı komuta --apply ekleyin.\n');
    return;
  }

  const token = await getAccessToken(KEY_PATH);

  const edit = await api(token, 'POST', `/androidpublisher/v3/applications/${PACKAGE_NAME}/edits`);
  const editId = edit.id;
  console.log(`Edit açıldı: ${editId}`);

  for (const { locale, files } of plan) {
    for (const imageType of IMAGE_TYPES) {
      // Mevcutları temizle — mağazadaki hatalı görseller bu adımda gider.
      await api(
        token,
        'DELETE',
        `/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}/listings/${locale}/${imageType}`,
      );

      for (const file of files) {
        const bytes = readFileSync(file);
        const ct = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
        const res = await fetch(
          `${UPLOAD_API}/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}` +
            `/listings/${locale}/${imageType}?uploadType=media`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': ct },
            body: bytes,
          },
        );
        if (!res.ok)
          die(`Yükleme başarısız: ${locale}/${imageType}/${basename(file)}\n${await res.text()}`);
        console.log(`  ✓ ${locale}/${imageType}/${basename(file)}`);
      }
    }
  }

  await api(
    token,
    'POST',
    `/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}:commit`,
  );
  console.log(
    `\n✓ Edit commit edildi. Play Console'da Mağaza girişleri'ni yenileyip doğrulayın.\n`,
  );
}

main().catch((e) => die(e.stack || String(e)));

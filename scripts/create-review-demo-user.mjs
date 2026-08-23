#!/usr/bin/env node
/**
 * Creates the App Review demo account that Apple's reviewer signs in with.
 *
 * Apple rejects apps whose gated features cannot be reached, so the account has
 * to exist before "Add for Review". Run this once, then paste the same email and
 * password into App Store Connect → Prepare for Submission → App Review
 * Information → Sign-In Information.
 *
 * The password is never stored here and never committed: you pass it in for the
 * length of one command.
 *
 *   DEMO_EMAIL=review@voxscore.app DEMO_PASSWORD='...' node scripts/create-review-demo-user.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment, falling back to .env.local / apps/web/.env.local.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(resolve(root, '.env.local'));
loadEnvFile(resolve(root, 'apps/web/.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;

const missing = Object.entries({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRole, DEMO_EMAIL: email, DEMO_PASSWORD: password })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  console.error("Example: DEMO_EMAIL=review@voxscore.app DEMO_PASSWORD='...' node scripts/create-review-demo-user.mjs");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  },
  // email_confirm skips the verification mail — the reviewer cannot read our inbox.
  body: JSON.stringify({ email, password, email_confirm: true }),
});

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`Failed (${res.status}):`, body.msg || body.error_description || JSON.stringify(body).slice(0, 300));
  process.exit(1);
}

console.log(`Created demo user ${body.email} (id ${body.id}).`);
console.log('Now paste the email and password into App Store Connect → App Review Information.');
console.log('Do not commit the password anywhere in this repo.');

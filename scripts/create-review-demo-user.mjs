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
 *   node scripts/create-review-demo-user.mjs review@voxscore.app '...'
 *
 * Arguments are used so the command is identical in bash and PowerShell; the
 * DEMO_EMAIL / DEMO_PASSWORD environment variables still work as a fallback.
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
const [argEmail, argPassword] = process.argv.slice(2);
const email = argEmail || process.env.DEMO_EMAIL;
const password = argPassword || process.env.DEMO_PASSWORD;

const missing = Object.entries({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRole, email, password })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  console.error("Usage: node scripts/create-review-demo-user.mjs <email> '<password>'");
  process.exit(1);
}

// The checked-in .env.local files point at the local stack, but the shipped app
// talks to production — an account created locally would not let a reviewer in.
if (/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is the local stack (${url}).`);
  console.error('The App Review account must exist in the production project that the release build uses.');
  console.error('Either sign up through the app on a device, or re-run with the production values:');
  console.error('  $env:NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"');
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

-- Wave 2 A3: salted one-way network hash on verified listens, for vote-burst
-- (brigade) detection. Stores sha256(ANTI_ABUSE_SALT + first x-forwarded-for
-- hop) — never the raw IP, and nothing at all when the header or salt is
-- absent. Keeps the /privacy "no invasive device fingerprinting" promise:
-- the hash cannot be reversed to an IP without the server-side salt.
alter table public.verified_listens add column ip_hash text;

-- The flag-vote-bursts cron scans recent listens grouped by network hash.
create index verified_listens_ip_hash_created_idx
  on public.verified_listens (ip_hash, created_at);

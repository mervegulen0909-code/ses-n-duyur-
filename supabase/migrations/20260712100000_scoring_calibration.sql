-- Per-criterion additive bias corrections, fitted from admin_scores human
-- anchors vs the LLM breakdown of the same performances (the calibration loop
-- admin_scores was designed for — previously write-only). Service-role only.
create table public.scoring_calibration (
  criterion    text primary key,
  offset_value numeric not null check (offset_value between -10 and 10),
  sample_count integer not null,
  fitted_at    timestamptz not null default now()
);
alter table public.scoring_calibration enable row level security;
-- No policies: readable/writable only via service_role (bypasses RLS).

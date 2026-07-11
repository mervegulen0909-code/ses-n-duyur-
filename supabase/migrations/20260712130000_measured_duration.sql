-- Wave 2 T13: "Duration-matched" Measured badge — did the measured take run
-- the same length (±5%) as the linked YouTube video? True/false when the
-- YouTube Data API duration was available at measurement time, null when it
-- was not (no key / lookup failed). measured_scores stays service-role-only,
-- so the flag can never be forged by a client.
alter table public.measured_scores add column duration_matched boolean;

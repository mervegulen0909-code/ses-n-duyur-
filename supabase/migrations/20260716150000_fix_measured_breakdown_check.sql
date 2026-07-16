-- Production hotfix: analysis_results_measured_breakdown_check in production
-- rejects NULL measured_breakdown, so every quality-rejected Analyzer result
-- makes finalize_ai_analysis abort (constraint 23514) and the callback 500s;
-- the user sees "Analyzer failed" instead of a clean "re-record" verdict.
-- Rejected results must be storable with a NULL breakdown.
-- Rollback: re-adding the stricter check would break rejected-result inserts
-- again; do not roll back.

alter table public.analysis_results
  drop constraint if exists analysis_results_measured_breakdown_check;

alter table public.analysis_results
  add constraint analysis_results_measured_breakdown_check
  check (measured_breakdown is null or jsonb_typeof(measured_breakdown) = 'object');

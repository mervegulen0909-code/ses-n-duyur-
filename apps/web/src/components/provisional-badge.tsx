/**
 * "Provisional AI Estimate" badge. Required wherever an MVP AI score from
 * YouTube content is shown — it is never a real audio measurement.
 */
export function ProvisionalBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300"
      title="Estimated by AI from metadata — not a real audio measurement."
    >
      Provisional AI Estimate
    </span>
  );
}

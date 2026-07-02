// Small display-formatting helpers shared across pages/components.

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US");
}

export function valueOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** YYYY-MM-DD, used for export filenames. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Compute numeric delta between current and previous values.
 * Returns null when comparison is impossible (previous is null/undefined).
 * Internal helper for `batchDelta` — not exported on purpose. */
function computeDelta(
  current: number | null | undefined,
  prev: number | null | undefined,
): number | null {
  if (prev === null || prev === undefined || current === null || current === undefined) return null;
  return current - prev;
}

/** Like `computeDelta`, but only when a previous batch actually exists.
 * When there is no previous batch, `prev_*` counters in dashboard_summary
 * come back as 0 (not NULL) because `count(*) WHERE batch_id = NULL` = 0.
 * This helper prevents showing misleading "↑N" deltas on the very first import. */
export function batchDelta(
  hasPrevBatch: boolean,
  current: number | null | undefined,
  prev: number | null | undefined,
): number | null {
  if (!hasPrevBatch) return null;
  return computeDelta(current, prev);
}

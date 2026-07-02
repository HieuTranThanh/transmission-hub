// "Excel-style" nested filter helpers — shared by every page with multiple
// select filters over the same dataset. The dropdown options for filter X are
// computed from rows that satisfy every OTHER active filter, so choosing a
// value in one filter narrows what the others can offer (and vice versa).
// See "Quy ước UI — Bộ lọc (Filter)" in README.md for how to wire a new filter
// into this pattern.

/** Distinct, sorted (vi locale) non-empty values of `pick(row)` across `rows`. */
function distinctValues<T>(rows: T[], pick: (row: T) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const value = pick(row);
    if (value) set.add(value);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
}

/**
 * Distinct values available for `targetKey`, restricted to rows that match
 * every OTHER entry of `selections` (the filter being computed is excluded
 * from its own constraint).
 *
 * When a selection already covers every distinct non-null value of its key
 * in `rows` it is treated as "no filter" — this prevents multi-select
 * "all checked" from aggressively narrowing sibling dropdowns.
 */
export function cascadingOptions<T>(rows: T[], selections: Record<string, string[]>, targetKey: keyof T & string): string[] {
  const keys = Object.keys(selections).filter((k) => k !== targetKey);
  const sets = Object.fromEntries(keys.map((k) => [k, new Set(selections[k])]));

  const skip: Record<string, boolean> = {};
  for (const k of keys) {
    const s = sets[k];
    if (s.size === 0) { skip[k] = true; continue; }
    skip[k] = !rows.some((row) => {
      const v = (row as unknown as Record<string, string | null | undefined>)[k];
      return v != null && v !== "" && !s.has(v);
    });
  }

  const matches = rows.filter((row) => {
    const r = row as unknown as Record<string, string | null | undefined>;
    return keys.every((k) => skip[k] || sets[k].has(r[k] ?? ""));
  });
  return distinctValues(matches, (row) => (row as unknown as Record<string, string | null | undefined>)[targetKey]);
}

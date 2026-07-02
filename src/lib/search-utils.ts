// Shared helpers for building safe PostgREST `.or()` / `.ilike()` filters
// from free-text user input.

/** Strips characters that would break a PostgREST `.or()` filter string. */
function sanitizeFilterValue(value: string): string {
  return value.replace(/[,()%]/g, " ").trim();
}

/** Wraps sanitized user input in `%...%` for an ILIKE substring match.
 * Escapes `_` → `\_` so it matches literally (PostgreSQL ILIKE treats
 * unescaped `_` as a single-character wildcard). */
export function ilikePattern(value: string): string {
  return `%${sanitizeFilterValue(value).replace(/_/g, "\\_")}%`;
}

/** Double-quotes a value for use inside a PostgREST `.or()` filter so that
 * reserved characters (`,` `(` `)` `.`) in the value — e.g. a device name —
 * don't break the filter grammar. Embedded `"` and `\` are escaped. */
export function orFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

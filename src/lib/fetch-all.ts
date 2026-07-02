import type { PostgrestError } from "@supabase/supabase-js";

/** PostgREST/Supabase caps a single response at `db-max-rows` (1000 by default),
 * so `.limit(n)` or `.range(0, n)` for n > 1000 silently returns only 1000 rows.
 * When the FULL result set is required — e.g. to compute the distinct values that
 * feed cascading filter dropdowns — page through it with `.range()` until a short
 * page signals the end. */
const SUPABASE_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

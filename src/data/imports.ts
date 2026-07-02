import { supabase } from "../lib/supabase";
import { cached } from "../lib/query-cache";
import type { ImportBatch } from "../types";

export function fetchImportBatches(): Promise<ImportBatch[]> {
  return cached("import_batches", async () => {
    const { data, error } = await supabase
      .from("import_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ImportBatch[];
  });
}

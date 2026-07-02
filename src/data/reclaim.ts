import { supabase } from "../lib/supabase";
import { ilikePattern, orFilterValue } from "../lib/search-utils";
import { fetchAllRows } from "../lib/fetch-all";
import { cached } from "../lib/query-cache";
import type { Confidence, PagedResult, ResourceCandidate, SortState } from "../types";

export interface ReclaimFiltersInput {
  confidence?: string[];
  candidateType?: string[];
  serviceType?: string[];
  reasons?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

/** DB columns the Reclaim table may be ordered by. */
const RECLAIM_SORT_COLUMNS = new Set([
  "confidence",
  "candidate_type",
  "device_name",
  "ip_address",
  "interface_name",
  "service_type",
  "current_status",
  "score",
  "priority_score",
  "reason",
  "is_new",
]);

export async function fetchResourceCandidates(filters: ReclaimFiltersInput): Promise<PagedResult<ResourceCandidate>> {
  const { confidence, candidateType, serviceType, reasons, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("latest_resource_candidates_enriched").select("*", { count: "exact" });

  const multi = [confidence, candidateType, serviceType, reasons];
  if (multi.some((f) => f !== undefined && f.length === 0)) return { rows: [], count: 0 };

  if (confidence && confidence.length > 0) query = query.in("confidence", confidence);
  if (candidateType && candidateType.length > 0) query = query.in("candidate_type", candidateType);
  if (serviceType && serviceType.length > 0) query = query.in("service_type", serviceType);
  if (reasons && reasons.length > 0) {
    query = query.or(reasons.map((r) => `reason.ilike.${orFilterValue(`%${r}%`)}`).join(","));
  }
  if (search?.trim()) {
    const pattern = ilikePattern(search);
    query = query.or(
      `device_name.ilike.${pattern},interface_name.ilike.${pattern},reason.ilike.${pattern},candidate_type.ilike.${pattern}`
    );
  }

  // A user-chosen sort takes priority; otherwise default to highest priority
  // first. id tiebreaker keeps OFFSET pagination stable despite primary-sort ties.
  if (sort && RECLAIM_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("priority_score", { ascending: false });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as ResourceCandidate[], count: count ?? 0 };
}

export interface ReclaimExportFilters {
  confidence?: string[];
  candidateType?: string[];
  serviceType?: string[];
  reasons?: string[];
  search?: string;
}

const RECLAIM_EXPORT_COLS = "is_new,confidence,candidate_type,device_name,device_ip,ip_address,network,interface_name,service_type,current_status,score,priority_score,reason";

export async function fetchAllResourceCandidates(filters: ReclaimExportFilters): Promise<Record<string, unknown>[]> {
  const { confidence, candidateType, serviceType, reasons, search } = filters;
  const multi = [confidence, candidateType, serviceType, reasons];
  if (multi.some((f) => f !== undefined && f.length === 0)) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_resource_candidates_enriched").select(RECLAIM_EXPORT_COLS);
    if (confidence && confidence.length > 0) query = query.in("confidence", confidence);
    if (candidateType && candidateType.length > 0) query = query.in("candidate_type", candidateType);
    if (serviceType && serviceType.length > 0) query = query.in("service_type", serviceType);
    if (reasons && reasons.length > 0) {
      query = query.or(reasons.map((r) => `reason.ilike.${orFilterValue(`%${r}%`)}`).join(","));
    }
    if (search?.trim()) {
      const pattern = ilikePattern(search);
      query = query.or(
        `device_name.ilike.${pattern},interface_name.ilike.${pattern},reason.ilike.${pattern},candidate_type.ilike.${pattern}`
      );
    }
    return query.order("priority_score", { ascending: false }).range(from, to);
  });
}

/** One reclaim candidate's filterable columns — fetched once per batch so the
 * Reclaim filter dropdowns can cascade against each other client-side (see
 * `cascadingOptions` in `src/lib/cascading-filters.ts`). */
export interface ReclaimFilterRow {
  confidence: Confidence;
  candidate_type: string;
  service_type: string | null;
  reason: string | null;
}

export function fetchReclaimFilterRows(): Promise<ReclaimFilterRow[]> {
  return cached("reclaim_filter_rows", () =>
    fetchAllRows<ReclaimFilterRow>((from, to) =>
      supabase.from("latest_resource_candidates").select("confidence,candidate_type,service_type,reason").range(from, to)
    )
  );
}

/** Splits a candidate's `reason` text into its individual factor lines (one
 * `reason.split("\n")` entry each, trimmed and de-blanked) — each line is one
 * selectable value in the "Lý do" multi-select filter. */
export function splitReasonFactors(reason: string | null): string[] {
  return (reason?.split("\n") ?? []).map((part) => part.trim()).filter((part) => part.length > 0);
}

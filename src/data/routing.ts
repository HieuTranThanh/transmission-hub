import { supabase } from "../lib/supabase";
import { ilikePattern } from "../lib/search-utils";
import { isValidIpv4 } from "../lib/ip";
import { fetchAllRows } from "../lib/fetch-all";
import { cached } from "../lib/query-cache";
import type { AuditFinding, BgpNeighbor, OspfNeighbor, PagedResult, Severity, SortState } from "../types";

const FINDINGS_SORT_COLUMNS = new Set([
  "severity",
  "category",
  "rule_code",
  "title",
  "device_name",
  "ip_address",
  "priority_score",
  "is_new",
]);

const BGP_SORT_COLUMNS = new Set([
  "device_name",
  "neighbor_ip",
  "neighbor_device_name",
  "remote_as",
  "bgp_state",
  "up_down",
  "flaps",
  "vpnv4_active",
  "last_error",
  "flap_delta",
  "prev_bgp_state",
]);

const OSPF_SORT_COLUMNS = new Set([
  "device_name",
  "neighbor_ip",
  "neighbor_router_id",
  "neighbor_device_name",
  "neighbor_state",
  "prev_neighbor_state",
]);

export interface RoutingFindingsFilters {
  domain?: string[];
  severity?: string[];
  rule?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

export async function fetchRoutingFindings(filters: RoutingFindingsFilters): Promise<PagedResult<AuditFinding>> {
  const { domain, severity, rule, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const multi = [domain, severity, rule];
  if (multi.some((f) => f !== undefined && f.length === 0)) return { rows: [], count: 0 };

  let query = supabase.from("latest_audit_findings_enriched").select("*", { count: "exact" });
  if (domain && domain.length > 0) query = query.in("category", domain);
  else query = query.in("category", ["BGP", "OSPF"]);

  if (severity && severity.length > 0) query = query.in("severity", severity);
  if (rule && rule.length > 0) query = query.in("rule_code", rule);
  if (search?.trim()) {
    const pattern = ilikePattern(search);
    query = query.or(`device_name.ilike.${pattern},title.ilike.${pattern},rule_code.ilike.${pattern}`);
  }

  // A user-chosen sort takes priority; otherwise highest priority first.
  // id tiebreaker keeps OFFSET pagination stable despite primary-sort ties.
  if (sort && FINDINGS_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("priority_score", { ascending: false });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AuditFinding[], count: count ?? 0 };
}

export interface RoutingExportFilters {
  domain?: string[];
  severity?: string[];
  rule?: string[];
  search?: string;
}

const ROUTING_EXPORT_COLS = "is_new,severity,category,rule_code,title,detail,device_name,device_ip,ip_address,confidence,priority_score";

export async function fetchAllRoutingFindings(filters: RoutingExportFilters): Promise<Record<string, unknown>[]> {
  const { domain, severity, rule, search } = filters;
  const multi = [domain, severity, rule];
  if (multi.some((f) => f !== undefined && f.length === 0)) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_audit_findings_enriched").select(ROUTING_EXPORT_COLS);
    if (domain && domain.length > 0) query = query.in("category", domain);
    else query = query.in("category", ["BGP", "OSPF"]);
    if (severity && severity.length > 0) query = query.in("severity", severity);
    if (rule && rule.length > 0) query = query.in("rule_code", rule);
    if (search?.trim()) {
      const pattern = ilikePattern(search);
      query = query.or(`device_name.ilike.${pattern},title.ilike.${pattern},rule_code.ilike.${pattern}`);
    }
    return query.order("priority_score", { ascending: false }).range(from, to);
  });
}

/** One routing (BGP/OSPF) finding's filterable columns — fetched once per
 * batch so the routing findings filters (Giao thức/Rule/Mức độ) can cascade
 * against each other client-side (see `cascadingOptions` in
 * `src/lib/cascading-filters.ts`). */
export interface RoutingFilterRow {
  category: string;
  rule_code: string;
  severity: Severity;
}

export function fetchRoutingFilterRows(): Promise<RoutingFilterRow[]> {
  return cached("routing_filter_rows", () =>
    fetchAllRows<RoutingFilterRow>((from, to) =>
      supabase.from("latest_audit_findings").select("category,rule_code,severity").in("category", ["BGP", "OSPF"]).range(from, to)
    )
  );
}

export interface BgpNeighborExportFilters {
  state?: string[];
  search?: string;
}

const BGP_EXPORT_COLS = "device_name,device_ip,neighbor_ip,neighbor_device_name,remote_as,description,bgp_state,prev_bgp_state,up_down,flaps,flap_delta,vpnv4_active,vpnv4_rcvd,last_error";

export async function fetchAllBgpNeighbors(filters: BgpNeighborExportFilters): Promise<Record<string, unknown>[]> {
  const { state, search } = filters;
  if (state !== undefined && state.length === 0) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_bgp_neighbors_enriched").select(BGP_EXPORT_COLS);
    if (state && state.length > 0) {
      const hasEst = state.includes("Established");
      const hasNotEst = state.includes("Not Established");
      if (hasEst && !hasNotEst) query = query.eq("bgp_state", "Established");
      else if (!hasEst && hasNotEst) query = query.or("bgp_state.is.null,bgp_state.neq.Established");
    }
    if (search?.trim()) {
      const term = search.trim();
      const pattern = ilikePattern(term);
      const ors = [`device_name.ilike.${pattern}`, `description.ilike.${pattern}`, `neighbor_device_name.ilike.${pattern}`];
      if (isValidIpv4(term)) ors.push(`neighbor_ip.eq.${term}`);
      query = query.or(ors.join(","));
    }
    return query.order("device_name", { ascending: true }).range(from, to);
  });
}

export interface OspfNeighborExportFilters {
  state?: string[];
  search?: string;
}

const OSPF_EXPORT_COLS = "device_name,device_ip,router_id,neighbor_ip,neighbor_router_id,neighbor_device_name,neighbor_state,prev_neighbor_state";

export async function fetchAllOspfNeighbors(filters: OspfNeighborExportFilters): Promise<Record<string, unknown>[]> {
  const { state, search } = filters;
  if (state !== undefined && state.length === 0) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_ospf_neighbors_enriched").select(OSPF_EXPORT_COLS);
    if (state && state.length > 0) {
      const hasFull = state.includes("Full");
      const hasNotFull = state.includes("Not Full");
      if (hasFull && !hasNotFull) query = query.ilike("neighbor_state", "full");
      else if (!hasFull && hasNotFull) query = query.or("neighbor_state.is.null,neighbor_state.not.ilike.full");
    }
    if (search?.trim()) {
      const term = search.trim();
      const pattern = ilikePattern(term);
      const ors = [`device_name.ilike.${pattern}`, `neighbor_device_name.ilike.${pattern}`];
      if (isValidIpv4(term)) ors.push(`neighbor_ip.eq.${term}`);
      query = query.or(ors.join(","));
    }
    return query.order("device_name", { ascending: true }).range(from, to);
  });
}

export interface BgpNeighborFilters {
  state?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

export async function fetchBgpNeighbors(filters: BgpNeighborFilters): Promise<PagedResult<BgpNeighbor>> {
  const { state, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  if (state !== undefined && state.length === 0) return { rows: [], count: 0 };

  let query = supabase.from("latest_bgp_neighbors_enriched").select("*", { count: "exact" });
  if (state && state.length > 0) {
    const hasEst = state.includes("Established");
    const hasNotEst = state.includes("Not Established");
    if (hasEst && !hasNotEst) query = query.eq("bgp_state", "Established");
    else if (!hasEst && hasNotEst) query = query.or("bgp_state.is.null,bgp_state.neq.Established");
  }

  if (search?.trim()) {
    const term = search.trim();
    const pattern = ilikePattern(term);
    // neighbor_ip is an inet column — Postgres has no ILIKE for inet, so only
    // match it by exact equality when the term parses as a full IPv4 address.
    const ors = [`device_name.ilike.${pattern}`, `description.ilike.${pattern}`, `neighbor_device_name.ilike.${pattern}`];
    if (isValidIpv4(term)) ors.push(`neighbor_ip.eq.${term}`);
    query = query.or(ors.join(","));
  }

  if (sort && BGP_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("device_name", { ascending: true });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as BgpNeighbor[], count: count ?? 0 };
}

export interface OspfNeighborFilters {
  state?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

export async function fetchOspfNeighbors(filters: OspfNeighborFilters): Promise<PagedResult<OspfNeighbor>> {
  const { state, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  if (state !== undefined && state.length === 0) return { rows: [], count: 0 };

  let query = supabase.from("latest_ospf_neighbors_enriched").select("*", { count: "exact" });
  if (state && state.length > 0) {
    const hasFull = state.includes("Full");
    const hasNotFull = state.includes("Not Full");
    if (hasFull && !hasNotFull) query = query.ilike("neighbor_state", "full");
    else if (!hasFull && hasNotFull) query = query.or("neighbor_state.is.null,neighbor_state.not.ilike.full");
  }

  if (search?.trim()) {
    const term = search.trim();
    const pattern = ilikePattern(term);
    // neighbor_ip is an inet column — match it by exact equality only.
    const ors = [`device_name.ilike.${pattern}`, `neighbor_device_name.ilike.${pattern}`];
    if (isValidIpv4(term)) ors.push(`neighbor_ip.eq.${term}`);
    query = query.or(ors.join(","));
  }

  if (sort && OSPF_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("device_name", { ascending: true });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as OspfNeighbor[], count: count ?? 0 };
}

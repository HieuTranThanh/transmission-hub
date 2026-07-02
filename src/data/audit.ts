import { supabase } from "../lib/supabase";
import { ilikePattern } from "../lib/search-utils";
import { fetchAllRows } from "../lib/fetch-all";
import { cached } from "../lib/query-cache";
import type { AuditFinding, PagedResult, Severity, SortState } from "../types";

/** Categories produced by the IP/inventory side of the rule engine (see
 * scripts/lib/audit-rules.ts). BGP/OSPF findings live on the Routing page. */
export const AUDIT_CATEGORIES = ["IP Duplicate", "Network", "Gateway", "Status", "Prefix"];

export interface AuditFiltersInput {
  severity?: string[];
  category?: string[];
  rule?: string[];
  serviceType?: string[];
  status?: string[];
  vrf?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

/** DB columns the IP Audit table may be ordered by (guards against arbitrary input). */
const AUDIT_SORT_COLUMNS = new Set([
  "severity",
  "category",
  "rule_code",
  "title",
  "device_name",
  "ip_address",
  "interface_name",
  "detail",
  "status",
  "priority_score",
  "is_new",
]);

export async function fetchAuditFindings(filters: AuditFiltersInput): Promise<PagedResult<AuditFinding>> {
  const { severity, category, rule, serviceType, status, vrf, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("latest_audit_findings_enriched").select("*", { count: "exact" }).in("category", AUDIT_CATEGORIES);

  const multi = [severity, category, rule, serviceType, status, vrf];
  if (multi.some((f) => f !== undefined && f.length === 0)) return { rows: [], count: 0 };

  if (severity && severity.length > 0) query = query.in("severity", severity);
  if (category && category.length > 0) query = query.in("category", category);
  if (rule && rule.length > 0) query = query.in("rule_code", rule);
  if (serviceType && serviceType.length > 0) query = query.in("service_type", serviceType);
  if (status && status.length > 0) query = query.in("intf_status", status);
  if (vrf && vrf.length > 0) query = query.in("vrf_instance", vrf);
  if (search?.trim()) {
    const pattern = ilikePattern(search);
    query = query.or(
      `device_name.ilike.${pattern},title.ilike.${pattern},rule_code.ilike.${pattern},interface_name.ilike.${pattern}`
    );
  }

  // A user-chosen sort takes priority; otherwise default to highest priority
  // first. The unique id tiebreaker keeps OFFSET pagination stable, since the
  // primary sort can have ties and non-deterministic order skips/duplicates rows.
  if (sort && AUDIT_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("priority_score", { ascending: false });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AuditFinding[], count: count ?? 0 };
}

export interface AuditExportFilters {
  severity?: string[];
  category?: string[];
  rule?: string[];
  serviceType?: string[];
  status?: string[];
  vrf?: string[];
  search?: string;
}

const AUDIT_EXPORT_COLS = "is_new,severity,category,rule_code,title,detail,device_name,device_ip,ip_address,network,interface_name,service_type,vrf_instance,intf_status,status,confidence,priority_score";

export async function fetchAllAuditFindings(filters: AuditExportFilters): Promise<Record<string, unknown>[]> {
  const { severity, category, rule, serviceType, status, vrf, search } = filters;
  const multi = [severity, category, rule, serviceType, status, vrf];
  if (multi.some((f) => f !== undefined && f.length === 0)) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_audit_findings_enriched").select(AUDIT_EXPORT_COLS).in("category", AUDIT_CATEGORIES);
    if (severity && severity.length > 0) query = query.in("severity", severity);
    if (category && category.length > 0) query = query.in("category", category);
    if (rule && rule.length > 0) query = query.in("rule_code", rule);
    if (serviceType && serviceType.length > 0) query = query.in("service_type", serviceType);
    if (status && status.length > 0) query = query.in("intf_status", status);
    if (vrf && vrf.length > 0) query = query.in("vrf_instance", vrf);
    if (search?.trim()) {
      const pattern = ilikePattern(search);
      query = query.or(
        `device_name.ilike.${pattern},title.ilike.${pattern},rule_code.ilike.${pattern},interface_name.ilike.${pattern}`
      );
    }
    return query.order("priority_score", { ascending: false }).range(from, to);
  });
}

/** One IP-side finding's filterable columns — fetched once per batch so the IP
 * Audit filter dropdowns can cascade against each other client-side (see
 * `cascadingOptions` in `src/lib/cascading-filters.ts`). */
export interface AuditFilterRow {
  severity: Severity;
  category: string;
  rule_code: string;
  service_type: string | null;
  intf_status: string | null;
  vrf_instance: string | null;
}

export function fetchAuditFilterRows(): Promise<AuditFilterRow[]> {
  return cached("audit_filter_rows", () =>
    fetchAllRows<AuditFilterRow>((from, to) =>
      supabase
        .from("latest_audit_findings")
        .select("severity,category,rule_code,service_type,intf_status,vrf_instance")
        .in("category", AUDIT_CATEGORIES)
        .range(from, to)
    )
  );
}

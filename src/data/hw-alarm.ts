import { supabase } from "../lib/supabase";
import { ilikePattern } from "../lib/search-utils";
import { fetchAllRows } from "../lib/fetch-all";
import { cached } from "../lib/query-cache";
import type { HwAlarmSummary, HwAlarmDetail, HwAlarmError, PagedResult, SortState } from "../types";

// ---------------------------------------------------------------------------
// Summary tab
// ---------------------------------------------------------------------------

export interface HwAlarmSummaryFilters {
  vendor?: string[];
  overallStatus?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

const SUMMARY_SORT_COLUMNS = new Set([
  "device_name", "device_ip", "vendor", "overall_status",
  "critical", "major", "minor", "power_status", "fan_status",
  "max_temp", "temp_threshold", "is_new",
]);

export async function fetchHwAlarmSummary(filters: HwAlarmSummaryFilters): Promise<PagedResult<HwAlarmSummary>> {
  const { vendor, overallStatus, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("latest_hw_alarm_summary_enriched").select("*", { count: "exact" });

  const multi = [vendor, overallStatus];
  if (multi.some((f) => f !== undefined && f.length === 0)) return { rows: [], count: 0 };

  if (vendor && vendor.length > 0) query = query.in("vendor", vendor);
  if (overallStatus && overallStatus.length > 0) query = query.in("overall_status", overallStatus);
  if (search?.trim()) {
    const pattern = ilikePattern(search);
    query = query.or(`device_name.ilike.${pattern},device_ip::text.ilike.${pattern}`);
  }

  if (sort && SUMMARY_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("critical", { ascending: false });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as HwAlarmSummary[], count: count ?? 0 };
}

export interface HwAlarmSummaryExportFilters {
  vendor?: string[];
  overallStatus?: string[];
  search?: string;
}

const SUMMARY_EXPORT_COLS = "is_new,device_name,device_ip,vendor,overall_status,prev_overall_status,critical,prev_critical,major,prev_major,minor,power_status,fan_status,max_temp,temp_threshold";

export async function fetchAllHwAlarmSummary(filters: HwAlarmSummaryExportFilters): Promise<Record<string, unknown>[]> {
  const { vendor, overallStatus, search } = filters;
  const multi = [vendor, overallStatus];
  if (multi.some((f) => f !== undefined && f.length === 0)) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_hw_alarm_summary_enriched").select(SUMMARY_EXPORT_COLS);
    if (vendor && vendor.length > 0) query = query.in("vendor", vendor);
    if (overallStatus && overallStatus.length > 0) query = query.in("overall_status", overallStatus);
    if (search?.trim()) {
      const pattern = ilikePattern(search);
      query = query.or(`device_name.ilike.${pattern},device_ip::text.ilike.${pattern}`);
    }
    return query.order("critical", { ascending: false }).range(from, to);
  });
}

export interface HwAlarmSummaryFilterRow {
  vendor: string | null;
  overall_status: string | null;
}

export function fetchHwAlarmSummaryFilterRows(): Promise<HwAlarmSummaryFilterRow[]> {
  return cached("hw_alarm_summary_filter_rows", () =>
    fetchAllRows<HwAlarmSummaryFilterRow>((from, to) =>
      supabase
        .from("latest_hw_alarm_summary")
        .select("vendor,overall_status")
        .range(from, to)
    )
  );
}

// ---------------------------------------------------------------------------
// Details tab
// ---------------------------------------------------------------------------

export interface HwAlarmDetailFilters {
  vendor?: string[];
  category?: string[];
  status?: string[];
  search?: string;
  sort?: SortState | null;
  page: number;
  pageSize: number;
}

const DETAIL_SORT_COLUMNS = new Set([
  "device_name", "device_ip", "vendor", "category", "severity",
  "component", "status", "detail", "is_new",
]);

export async function fetchHwAlarmDetails(filters: HwAlarmDetailFilters): Promise<PagedResult<HwAlarmDetail>> {
  const { vendor, category, status, search, sort, page, pageSize } = filters;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("latest_hw_alarm_details_enriched").select("*", { count: "exact" });

  const multi = [vendor, category, status];
  if (multi.some((f) => f !== undefined && f.length === 0)) return { rows: [], count: 0 };

  if (vendor && vendor.length > 0) query = query.in("vendor", vendor);
  if (category && category.length > 0) query = query.in("category", category);
  if (status && status.length > 0) query = query.in("status", status);
  if (search?.trim()) {
    const pattern = ilikePattern(search);
    query = query.or(`device_name.ilike.${pattern},component.ilike.${pattern},detail.ilike.${pattern}`);
  }

  if (sort && DETAIL_SORT_COLUMNS.has(sort.key)) {
    query = query.order(sort.key, { ascending: sort.dir === "asc" });
  } else {
    query = query.order("device_name", { ascending: true });
  }
  const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as HwAlarmDetail[], count: count ?? 0 };
}

export interface HwAlarmDetailExportFilters {
  vendor?: string[];
  category?: string[];
  status?: string[];
  search?: string;
}

const DETAIL_EXPORT_COLS = "is_new,device_name,device_ip,vendor,category,severity,component,status,prev_status,detail";

export async function fetchAllHwAlarmDetails(filters: HwAlarmDetailExportFilters): Promise<Record<string, unknown>[]> {
  const { vendor, category, status, search } = filters;
  const multi = [vendor, category, status];
  if (multi.some((f) => f !== undefined && f.length === 0)) return [];

  return fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("latest_hw_alarm_details_enriched").select(DETAIL_EXPORT_COLS);
    if (vendor && vendor.length > 0) query = query.in("vendor", vendor);
    if (category && category.length > 0) query = query.in("category", category);
    if (status && status.length > 0) query = query.in("status", status);
    if (search?.trim()) {
      const pattern = ilikePattern(search);
      query = query.or(`device_name.ilike.${pattern},component.ilike.${pattern},detail.ilike.${pattern}`);
    }
    return query.order("device_name", { ascending: true }).range(from, to);
  });
}

export interface HwAlarmDetailFilterRow {
  vendor: string | null;
  category: string | null;
  status: string | null;
}

export function fetchHwAlarmDetailFilterRows(): Promise<HwAlarmDetailFilterRow[]> {
  return cached("hw_alarm_detail_filter_rows", () =>
    fetchAllRows<HwAlarmDetailFilterRow>((from, to) =>
      supabase
        .from("latest_hw_alarm_details")
        .select("vendor,category,status")
        .range(from, to)
    )
  );
}

// ---------------------------------------------------------------------------
// Errors tab
// ---------------------------------------------------------------------------

export function fetchHwAlarmErrors(): Promise<HwAlarmError[]> {
  return cached("hw_alarm_errors", async () => {
    return fetchAllRows<HwAlarmError>((from, to) =>
      supabase
        .from("latest_hw_alarm_errors")
        .select("*")
        .order("device_name", { ascending: true })
        .range(from, to)
    );
  });
}

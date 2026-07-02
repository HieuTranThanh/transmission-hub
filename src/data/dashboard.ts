import { supabase } from "../lib/supabase";
import { cached } from "../lib/query-cache";
import type { AuditFinding, BgpNeighbor, DashboardSummary, HwAlarmSummary, OspfNeighbor, ResourceCandidate } from "../types";

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return cached("dashboard_summary", async () => {
    const { data, error } = await supabase.from("dashboard_summary").select("*").single();
    if (error) throw new Error(error.message);
    return data as DashboardSummary;
  });
}

export function fetchTopFindings(limit = 5): Promise<AuditFinding[]> {
  return cached(`top_findings_${limit}`, async () => {
    const { data, error } = await supabase
      .from("latest_audit_findings")
      .select("*")
      .order("priority_score", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditFinding[];
  });
}

export function fetchTopReclaimCandidates(limit = 5): Promise<ResourceCandidate[]> {
  return cached(`top_reclaim_${limit}`, async () => {
    const { data, error } = await supabase
      .from("latest_resource_candidates")
      .select("*")
      .order("priority_score", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ResourceCandidate[];
  });
}

export function fetchTopOspfNotFull(limit = 10): Promise<OspfNeighbor[]> {
  return cached(`top_ospf_not_full_${limit}`, async () => {
    const { data, error } = await supabase
      .from("latest_ospf_neighbors_enriched")
      .select("*")
      .or("neighbor_state.is.null,neighbor_state.not.ilike.full")
      .order("device_name", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as OspfNeighbor[];
  });
}

export function fetchTopBgpHighFlaps(limit = 10): Promise<BgpNeighbor[]> {
  return cached(`top_bgp_flaps_${limit}`, async () => {
    const { data, error } = await supabase
      .from("latest_bgp_neighbors_enriched")
      .select("*")
      .or("flap_delta.gt.0,flaps.gt.0")
      .order("flap_delta", { ascending: false, nullsFirst: false })
      .order("flaps", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as BgpNeighbor[];
  });
}

export function fetchTopHwAlarmCritical(limit = 10): Promise<HwAlarmSummary[]> {
  return cached(`top_hw_alarm_critical_${limit}`, async () => {
    const { data, error } = await supabase
      .from("latest_hw_alarm_summary_enriched")
      .select("*")
      .in("overall_status", ["Critical", "Warning"])
      .order("critical", { ascending: false })
      .order("major", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as HwAlarmSummary[];
  });
}

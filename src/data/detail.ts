// Fetches everything Transmission Hub knows about a single IP address and/or
// device name, for the DetailDrawer ("resource detail in a few clicks").

import { supabase } from "../lib/supabase";
import { cached } from "../lib/query-cache";
import { orFilterValue } from "../lib/search-utils";
import type {
  IpAssignment,
  AuditFinding,
  ResourceCandidate,
  BgpSummary,
  BgpNeighbor,
  OspfInterface,
  OspfNeighbor,
  HwAlarmSummary,
} from "../types";

const LIMIT = 20;

export interface DetailSubject {
  ipAddress?: string | null;
  deviceName?: string | null;
}

export interface SubjectDetail {
  inventory: IpAssignment[];
  findings: AuditFinding[];
  reclaim: ResourceCandidate[];
  bgpSummary: BgpSummary[];
  bgpNeighbors: BgpNeighbor[];
  ospfInterfaces: OspfInterface[];
  ospfNeighbors: OspfNeighbor[];
  hwAlarmSummary: HwAlarmSummary[];
}

export const EMPTY_SUBJECT_DETAIL: SubjectDetail = {
  inventory: [],
  findings: [],
  reclaim: [],
  bgpSummary: [],
  bgpNeighbors: [],
  ospfInterfaces: [],
  ospfNeighbors: [],
  hwAlarmSummary: [],
};

async function queryOr(
  table: string,
  ip: string | null,
  ipColumns: string[],
  deviceName: string | null,
  nameColumns: string[]
): Promise<unknown[]> {
  const parts: string[] = [];
  if (ip) parts.push(...ipColumns.map((c) => `${c}.eq.${orFilterValue(ip)}`));
  if (deviceName) parts.push(...nameColumns.map((c) => `${c}.eq.${orFilterValue(deviceName)}`));
  if (parts.length === 0) return [];

  const { data, error } = await supabase.from(table).select("*").or(parts.join(",")).limit(LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function fetchSubjectDetail(subject: DetailSubject): Promise<SubjectDetail> {
  const ip = subject.ipAddress?.trim() || null;
  const deviceName = subject.deviceName?.trim() || null;
  if (!ip && !deviceName) return Promise.resolve(EMPTY_SUBJECT_DETAIL);

  const key = `detail:${ip ?? ""}:${deviceName ?? ""}`;
  return cached(key, async () => {
    const [inventory, findings, reclaim, bgpSummary, bgpNeighbors, ospfInterfaces, ospfNeighbors, hwAlarmSummary] =
      await Promise.all([
        queryOr("latest_ip_assignments", ip, ["ip_address"], deviceName, ["device_name"]),
        queryOr("latest_audit_findings", ip, ["ip_address"], deviceName, ["device_name"]),
        queryOr("latest_resource_candidates", ip, ["ip_address"], deviceName, ["device_name"]),
        queryOr("latest_bgp_summary", ip, ["router_id"], deviceName, ["device_name"]),
        queryOr("latest_bgp_neighbors", ip, ["neighbor_ip"], deviceName, ["device_name"]),
        queryOr("latest_ospf_interfaces", ip, ["if_ip"], deviceName, ["device_name"]),
        queryOr("latest_ospf_neighbors", ip, ["neighbor_ip"], deviceName, ["device_name"]),
        queryOr("latest_hw_alarm_summary", ip, ["device_ip"], deviceName, ["device_name"]),
      ]);

    const findingsTyped = findings as AuditFinding[];
    const reclaimTyped = reclaim as ResourceCandidate[];

    return {
      inventory: inventory as IpAssignment[],
      findings: [...findingsTyped].sort((a, b) => b.priority_score - a.priority_score),
      reclaim: [...reclaimTyped].sort((a, b) => b.priority_score - a.priority_score),
      bgpSummary: bgpSummary as BgpSummary[],
      bgpNeighbors: bgpNeighbors as BgpNeighbor[],
      ospfInterfaces: ospfInterfaces as OspfInterface[],
      ospfNeighbors: ospfNeighbors as OspfNeighbor[],
      hwAlarmSummary: hwAlarmSummary as HwAlarmSummary[],
    };
  });
}

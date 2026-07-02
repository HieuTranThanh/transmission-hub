// Global search — the primary UX flow of Transmission Hub. Detects whether
// the query looks like an IP, a subnet (CIDR), a VLAN ID, or free text, and
// queries the relevant "latest_*" views accordingly.

import { supabase } from "../lib/supabase";
import { cached } from "../lib/query-cache";
import { cidrToNetwork, isValidCidr, isValidIpv4 } from "../lib/ip";
import { ilikePattern } from "../lib/search-utils";
import type {
  AuditFinding,
  BgpNeighbor,
  BgpSummary,
  HwAlarmSummary,
  IpAssignment,
  OspfInterface,
  OspfNeighbor,
  ResourceCandidate,
  SearchQueryType,
  SearchResults,
} from "../types";

const RESULT_LIMIT = 50;

function detectQueryType(rawQuery: string): SearchQueryType {
  const q = rawQuery.trim();
  if (isValidCidr(q)) return "subnet";
  if (isValidIpv4(q)) return "ip";
  if (/^\d+$/.test(q)) return "vlan";
  return "text";
}

async function run<T>(promise: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data ?? [];
}

const EMPTY_RESULTS = (query: string, queryType: SearchQueryType): SearchResults => ({
  query,
  queryType,
  inventory: [],
  inventoryReferenced: [],
  inventoryNetwork: [],
  bgpSummary: [],
  bgpNeighbors: [],
  ospfInterfaces: [],
  ospfNeighbors: [],
  ospfNeighborsReferenced: [],
  findings: [],
  reclaim: [],
  hwAlarmSummary: [],
});

async function searchByIp(query: string): Promise<SearchResults> {
  const [inventory, inventoryNetwork, bgpSummary, bgpNeighbors, ospfInterfaces, ospfNeighbors, findings, reclaim, hwAlarmSummary] = await Promise.all([
    run<IpAssignment>(
      supabase
        .from("latest_ip_assignments")
        .select("*")
        .or(`ip_address.eq.${query},device_ip.eq.${query},loopback_ip.eq.${query},gateway.eq.${query}`)
        .limit(RESULT_LIMIT)
    ),
    // Rows whose allocated network (subnet) contains this IP, even if no
    // row's own ip_address matches it exactly — e.g. an unused host in an
    // assigned /30.
    run<IpAssignment>(
      supabase.rpc("search_ip_assignments_containing_ip", { p_ip: query }).limit(RESULT_LIMIT)
    ),
    run<BgpSummary>(
      supabase.from("latest_bgp_summary").select("*").or(`router_id.eq.${query},device_ip.eq.${query}`).limit(RESULT_LIMIT)
    ),
    run<BgpNeighbor>(
      supabase
        .from("latest_bgp_neighbors")
        .select("*")
        .or(`neighbor_ip.eq.${query},device_ip.eq.${query},router_id.eq.${query}`)
        .limit(RESULT_LIMIT)
    ),
    run<OspfInterface>(
      supabase
        .from("latest_ospf_interfaces")
        .select("*")
        .or(`if_ip.eq.${query},router_id.eq.${query},device_ip.eq.${query}`)
        .limit(RESULT_LIMIT)
    ),
    run<OspfNeighbor>(
      supabase
        .from("latest_ospf_neighbors")
        .select("*")
        .or(`neighbor_ip.eq.${query},neighbor_router_id.eq.${query},router_id.eq.${query},device_ip.eq.${query}`)
        .limit(RESULT_LIMIT)
    ),
    run<AuditFinding>(
      supabase
        .from("latest_audit_findings")
        .select("*")
        .or(`ip_address.eq.${query},device_ip.eq.${query}`)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
    run<ResourceCandidate>(
      supabase
        .from("latest_resource_candidates")
        .select("*")
        .or(`ip_address.eq.${query},device_ip.eq.${query}`)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
    run<HwAlarmSummary>(
      supabase
        .from("latest_hw_alarm_summary")
        .select("*")
        .eq("device_ip", query)
        .limit(RESULT_LIMIT)
    ),
  ]);

  return { query, queryType: "ip", inventory, inventoryReferenced: [], inventoryNetwork, bgpSummary, bgpNeighbors, ospfInterfaces, ospfNeighbors, ospfNeighborsReferenced: [], findings, reclaim, hwAlarmSummary };
}

async function searchBySubnet(query: string): Promise<SearchResults> {
  // Postgres cidr/inet casts reject values with host bits set (e.g.
  // "10.250.60.137/30"), which would otherwise make the RPC arg and the
  // `network` equality below throw. Normalize to the network base first.
  const subnet = cidrToNetwork(query) ?? query;

  const [{ data: inventory, error }, findings, reclaim] = await Promise.all([
    supabase.rpc("search_ip_assignments_by_subnet", { p_subnet: subnet }).limit(RESULT_LIMIT),
    run<AuditFinding>(
      supabase
        .from("latest_audit_findings")
        .select("*")
        .eq("network", subnet)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
    run<ResourceCandidate>(
      supabase
        .from("latest_resource_candidates")
        .select("*")
        .eq("network", subnet)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
  ]);
  if (error) throw new Error(error.message);

  return {
    query,
    queryType: "subnet",
    inventory: (inventory ?? []) as IpAssignment[],
    inventoryReferenced: [],
    inventoryNetwork: [],
    bgpSummary: [],
    ospfNeighborsReferenced: [],
    bgpNeighbors: [],
    ospfInterfaces: [],
    ospfNeighbors: [],
    findings,
    reclaim,
    hwAlarmSummary: [],
  };
}

async function searchByVlan(query: string): Promise<SearchResults> {
  const vlanId = Number(query);
  // vlan_id is a Postgres int4; a number outside its range would make the
  // query error out. Such input can't match any VLAN, so return empty.
  if (!Number.isInteger(vlanId) || vlanId < 0 || vlanId > 2147483647) {
    return EMPTY_RESULTS(query, "vlan");
  }
  const inventory = await run<IpAssignment>(
    supabase.from("latest_ip_assignments").select("*").eq("vlan_id", vlanId).limit(RESULT_LIMIT)
  );

  const ips = [...new Set(inventory.map((row) => row.ip_address).filter((ip): ip is string => !!ip))];
  if (ips.length === 0) {
    return { ...EMPTY_RESULTS(query, "vlan"), inventory };
  }

  const [findings, reclaim] = await Promise.all([
    run<AuditFinding>(
      supabase
        .from("latest_audit_findings")
        .select("*")
        .in("ip_address", ips)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
    run<ResourceCandidate>(
      supabase
        .from("latest_resource_candidates")
        .select("*")
        .in("ip_address", ips)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
  ]);

  return { ...EMPTY_RESULTS(query, "vlan"), inventory, findings, reclaim, hwAlarmSummary: [] };
}

async function searchByText(query: string): Promise<SearchResults> {
  const pattern = ilikePattern(query);

  // The same station name lives in two very different places: `device_name`
  // (config that lives ON that device) versus `interface_name` /
  // `port_description` / `vlan_description` / `vrf_instance` (the far-end
  // station referenced in declarations ON OTHER devices). We query them
  // separately so the UI can keep the two intents distinct.
  const [
    inventory,
    inventoryReferenced,
    bgpSummary,
    bgpNeighbors,
    ospfInterfaces,
    ospfNeighbors,
    ospfNeighborsReferenced,
    findings,
    reclaim,
    hwAlarmSummary,
  ] = await Promise.all([
      run<IpAssignment>(
        supabase.from("latest_ip_assignments").select("*").ilike("device_name", pattern).limit(RESULT_LIMIT)
      ),
      run<IpAssignment>(
        supabase
          .from("latest_ip_assignments")
          .select("*")
          .not("device_name", "ilike", pattern)
          .or(
            `interface_name.ilike.${pattern},port_description.ilike.${pattern},vlan_description.ilike.${pattern},vrf_instance.ilike.${pattern}`
          )
          .limit(RESULT_LIMIT)
      ),
      run<BgpSummary>(supabase.from("latest_bgp_summary").select("*").ilike("device_name", pattern).limit(RESULT_LIMIT)),
    run<BgpNeighbor>(
      supabase
        .from("latest_bgp_neighbors")
        .select("*")
        .or(`device_name.ilike.${pattern},description.ilike.${pattern},bgp_group.ilike.${pattern},neighbor_device_name.ilike.${pattern}`)
        .limit(RESULT_LIMIT)
    ),
    run<OspfInterface>(
      supabase
        .from("latest_ospf_interfaces")
        .select("*")
        .or(`device_name.ilike.${pattern},if_name.ilike.${pattern}`)
        .limit(RESULT_LIMIT)
    ),
    // OSPF neighbors split like inventory: the neighbor table that lives ON
    // the matched device vs. OTHER devices that see the matched station as a
    // neighbor (neighbor_device_name = far-end).
    run<OspfNeighbor>(
      supabase.from("latest_ospf_neighbors").select("*").ilike("device_name", pattern).limit(RESULT_LIMIT)
    ),
    run<OspfNeighbor>(
      supabase
        .from("latest_ospf_neighbors")
        .select("*")
        .not("device_name", "ilike", pattern)
        .ilike("neighbor_device_name", pattern)
        .limit(RESULT_LIMIT)
    ),
    run<AuditFinding>(
      supabase
        .from("latest_audit_findings")
        .select("*")
        .or(`device_name.ilike.${pattern},title.ilike.${pattern},rule_code.ilike.${pattern},interface_name.ilike.${pattern}`)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
    run<ResourceCandidate>(
      supabase
        .from("latest_resource_candidates")
        .select("*")
        .or(`device_name.ilike.${pattern},interface_name.ilike.${pattern},reason.ilike.${pattern}`)
        .order("priority_score", { ascending: false })
        .limit(RESULT_LIMIT)
    ),
    run<HwAlarmSummary>(
      supabase.from("latest_hw_alarm_summary").select("*").ilike("device_name", pattern).limit(RESULT_LIMIT)
    ),
    ]);

  return {
    query,
    queryType: "text",
    inventory,
    inventoryReferenced,
    inventoryNetwork: [],
    bgpSummary,
    bgpNeighbors,
    ospfInterfaces,
    ospfNeighbors,
    ospfNeighborsReferenced,
    findings,
    reclaim,
    hwAlarmSummary,
  };
}

export function search(rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (!query) return Promise.resolve(EMPTY_RESULTS(query, "text"));

  const queryType = detectQueryType(query);
  return cached(`search:${queryType}:${query}`, () => {
    switch (queryType) {
      case "ip":
        return searchByIp(query);
      case "subnet":
        return searchBySubnet(query);
      case "vlan":
        return searchByVlan(query);
      default:
        return searchByText(query);
    }
  });
}

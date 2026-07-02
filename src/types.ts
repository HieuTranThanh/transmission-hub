// Mirrors supabase/migrations/001_initial_schema.sql — keep in sync.

export type ImportStatus = "running" | "completed" | "failed";

export interface ImportBatch {
  id: string;
  created_at: string;
  source_label: string | null;
  source_files: string[];
  status: ImportStatus;
  inventory_rows: number;
  ospf_interface_rows: number;
  ospf_neighbor_rows: number;
  ospf_error_rows: number;
  bgp_summary_rows: number;
  bgp_neighbor_rows: number;
  bgp_error_rows: number;
  audit_finding_rows: number;
  resource_candidate_rows: number;
  hw_alarm_summary_rows: number;
  hw_alarm_detail_rows: number;
  hw_alarm_error_rows: number;
  notes: string | null;
  completed_at: string | null;
}

export interface Device {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  loopback_ip: string | null;
  router_id: string | null;
  local_as: number | null;
  source: string | null;
}

export interface IpAssignment {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  loopback_ip: string | null;
  interface_name: string | null;
  vlan_id: number | null;
  vlan_description: string | null;
  vrf_instance: string | null;
  ip_address: string | null;
  prefix_length: number | null;
  network: string | null;
  gateway: string | null;
  physical_port: string | null;
  port_description: string | null;
  service_type: string | null;
  admin_state: string | null;
  oper_state: string | null;
  static_routes: string | null;
  notes: string | null;
  status: string | null;
}

export interface OspfInterface {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  router_id: string | null;
  ospf_admin: string | null;
  if_ip: string | null;
  if_name: string | null;
  area: string | null;
  if_admin: string | null;
  if_state: string | null;
  cost: number | null;
  mtu: number | null;
  data_source: string | null;
  captured_at: string | null;
}

export interface OspfNeighbor {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  router_id: string | null;
  ospf_admin: string | null;
  neighbor_ip: string | null;
  neighbor_router_id: string | null;
  neighbor_device_name: string | null;
  name_source: string | null;
  neighbor_state: string | null;
  captured_at: string | null;
  // Enriched (from latest_ospf_neighbors_enriched)
  prev_neighbor_state?: string | null;
}

export interface OspfErrorRow {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  error_type: string | null;
  error_detail: string | null;
  captured_at: string | null;
}

export interface BgpSummary {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  router_id: string | null;
  local_as: number | null;
  bgp_admin_state: string | null;
  bgp_oper_state: string | null;
  total_peers: number | null;
  established: number | null;
  not_established: number | null;
  vpnv4_rcvd: number | null;
  vpnv4_active: number | null;
  status: string | null;
  captured_at: string | null;
}

export interface BgpNeighbor {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  router_id: string | null;
  local_as: number | null;
  neighbor_ip: string | null;
  neighbor_device_name: string | null;
  name_source: string | null;
  remote_as: number | null;
  description: string | null;
  bgp_group: string | null;
  bgp_state: string | null;
  up_down: string | null;
  flaps: number | null;
  last_error: string | null;
  hold_time: number | null;
  vpnv4_rcvd: number | null;
  vpnv4_active: number | null;
  anomaly: string | null;
  captured_at: string | null;
  // Enriched (from latest_bgp_neighbors_enriched)
  prev_flaps?: number | null;
  flap_delta?: number | null;
  prev_bgp_state?: string | null;
}

export interface BgpErrorRow {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  error: string | null;
}

export type Severity = "Critical" | "High" | "Medium" | "Low" | "Info";

export interface AuditFinding {
  id: string;
  import_batch_id: string;
  severity: Severity;
  category: string;
  rule_code: string;
  title: string;
  detail: string | null;
  device_name: string | null;
  device_ip: string | null;
  ip_address: string | null;
  network: string | null;
  interface_name: string | null;
  service_type: string | null;
  vrf_instance: string | null;
  intf_status: string | null;
  status: string;
  confidence: number | null;
  priority_score: number;
  evidence: Record<string, unknown>;
  created_at: string;
  // Enriched (from latest_audit_findings_enriched)
  is_new?: boolean;
}

export type Confidence = "High" | "Medium" | "Low";

export interface ResourceCandidate {
  id: string;
  import_batch_id: string;
  candidate_type: string;
  score: number;
  priority_score: number;
  confidence: Confidence;
  reason: string | null;
  device_name: string | null;
  device_ip: string | null;
  ip_address: string | null;
  network: string | null;
  interface_name: string | null;
  service_type: string | null;
  current_status: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
  // Enriched (from latest_resource_candidates_enriched)
  is_new?: boolean;
}

export interface DashboardSummary {
  latest_batch_id: string | null;
  latest_batch_created_at: string | null;
  latest_batch_source_label: string | null;
  total_devices: number;
  total_ip_assignments: number;
  status_active: number;
  status_admin_down: number;
  status_link_down: number;
  status_up_no_peer: number;
  status_failed: number;
  duplicate_ip_count: number;
  findings_critical: number;
  findings_high: number;
  findings_medium: number;
  findings_low: number;
  findings_info: number;
  findings_total: number;
  bgp_status_ok: number;
  bgp_status_warning: number;
  bgp_status_error: number;
  bgp_peers_not_established: number;
  bgp_collection_errors: number;
  ospf_neighbors_not_full: number;
  ospf_collection_errors: number;
  reclaim_total: number;
  reclaim_high: number;
  reclaim_medium: number;
  reclaim_low: number;

  // Previous batch (delta comparison)
  prev_batch_id: string | null;
  prev_batch_created_at: string | null;
  prev_batch_source_label: string | null;
  prev_total_devices: number | null;
  prev_total_ip_assignments: number | null;
  prev_status_active: number | null;
  prev_status_admin_down: number | null;
  prev_status_link_down: number | null;
  prev_status_up_no_peer: number | null;
  prev_status_failed: number | null;
  prev_duplicate_ip_count: number | null;
  prev_findings_critical: number | null;
  prev_findings_high: number | null;
  prev_findings_medium: number | null;
  prev_findings_low: number | null;
  prev_findings_info: number | null;
  prev_findings_total: number | null;
  prev_bgp_status_ok: number | null;
  prev_bgp_status_warning: number | null;
  prev_bgp_status_error: number | null;
  prev_bgp_peers_not_established: number | null;
  prev_bgp_collection_errors: number | null;
  prev_ospf_neighbors_not_full: number | null;
  prev_ospf_collection_errors: number | null;
  prev_reclaim_total: number | null;
  prev_reclaim_high: number | null;
  prev_reclaim_medium: number | null;
  prev_reclaim_low: number | null;

  // Cross-batch derived metrics
  findings_new: number | null;
  findings_resolved: number | null;
  bgp_flap_increased: number | null;
  bgp_flap_total_increase: number | null;
  ospf_neighbors_disappeared: number | null;

  // HW Alarm metrics (current batch)
  hw_alarm_total_devices: number;
  hw_alarm_critical: number;
  hw_alarm_warning: number;
  hw_alarm_ok: number;
  hw_alarm_detail_critical: number;
  hw_alarm_detail_major: number;
  hw_alarm_detail_minor: number;
  hw_alarm_collection_errors: number;

  // HW Alarm metrics (previous batch)
  prev_hw_alarm_total_devices: number | null;
  prev_hw_alarm_critical: number | null;
  prev_hw_alarm_warning: number | null;
  prev_hw_alarm_ok: number | null;
  prev_hw_alarm_detail_critical: number | null;
  prev_hw_alarm_detail_major: number | null;
  prev_hw_alarm_detail_minor: number | null;
  prev_hw_alarm_collection_errors: number | null;
}

// ---------------------------------------------------------------------------
// HW Alarm
// ---------------------------------------------------------------------------

export interface HwAlarmSummary {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  critical: number;
  major: number;
  minor: number;
  power_status: string | null;
  fan_status: string | null;
  max_temp: string | null;
  temp_threshold: string | null;
  overall_status: string | null;
  captured_at: string | null;
  // Enriched (from latest_hw_alarm_summary_enriched)
  prev_overall_status?: string | null;
  prev_critical?: number | null;
  prev_major?: number | null;
  prev_minor?: number | null;
  is_new?: boolean;
}

export interface HwAlarmDetail {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  category: string | null;
  severity: string | null;
  component: string | null;
  status: string | null;
  detail: string | null;
  captured_at: string | null;
  // Enriched (from latest_hw_alarm_details_enriched)
  prev_severity?: string | null;
  prev_status?: string | null;
  is_new?: boolean;
}

export interface HwAlarmError {
  id: string;
  import_batch_id: string;
  device_name: string | null;
  device_ip: string | null;
  vendor: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchQueryType = "ip" | "subnet" | "vlan" | "text";

export interface SearchResults {
  query: string;
  queryType: SearchQueryType;
  /** Inventory rows whose own `device_name` matches the query — config that
   * lives ON the matched device(s). */
  inventory: IpAssignment[];
  /** Inventory rows on OTHER devices that reference the query in their
   * interface / port description / VLAN / VRF (text search only). */
  inventoryReferenced: IpAssignment[];
  /** Inventory rows whose allocated `network` (subnet) contains the queried
   * IP, even though no row's `ip_address` matches it exactly (IP search only). */
  inventoryNetwork: IpAssignment[];
  bgpSummary: BgpSummary[];
  bgpNeighbors: BgpNeighbor[];
  ospfInterfaces: OspfInterface[];
  /** OSPF neighbor rows whose own `device_name` matches the query. */
  ospfNeighbors: OspfNeighbor[];
  /** OSPF neighbor rows on OTHER devices that see the query as a neighbor
   * (`neighbor_device_name` matches; text search only). */
  ospfNeighborsReferenced: OspfNeighbor[];
  findings: AuditFinding[];
  reclaim: ResourceCandidate[];
  hwAlarmSummary: HwAlarmSummary[];
}

// ---------------------------------------------------------------------------
// Generic pagination
// ---------------------------------------------------------------------------

export interface PagedResult<T> {
  rows: T[];
  count: number;
}

// ---------------------------------------------------------------------------
// Table sorting
// ---------------------------------------------------------------------------

export type SortDir = "asc" | "desc";

export interface SortState {
  /** Column identity to sort by — for server-side tables this is the DB column. */
  key: string;
  dir: SortDir;
}

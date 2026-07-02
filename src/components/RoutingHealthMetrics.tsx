import { StatStripGroup, type StatItem } from "./StatStrip";
import { batchDelta, formatNumber } from "../lib/format";
import type { DashboardSummary } from "../types";

export function RoutingHealthMetrics({ summary }: { summary: DashboardSummary }) {
  const hasPrev = summary.prev_batch_id != null;
  const d = (curr: number | null | undefined, prev: number | null | undefined) => batchDelta(hasPrev, curr, prev);

  const bgpItems: StatItem[] = [
    { label: "BGP OK", value: formatNumber(summary.bgp_status_ok), tone: "ok", delta: d(summary.bgp_status_ok, summary.prev_bgp_status_ok) },
    { label: "BGP WARNING", value: formatNumber(summary.bgp_status_warning), tone: "medium", delta: d(summary.bgp_status_warning, summary.prev_bgp_status_warning), deltaInverted: true },
    { label: "BGP ERROR", value: formatNumber(summary.bgp_status_error), tone: "critical", delta: d(summary.bgp_status_error, summary.prev_bgp_status_error), deltaInverted: true },
    { label: "Peer chưa Established", value: formatNumber(summary.bgp_peers_not_established), tone: "high", delta: d(summary.bgp_peers_not_established, summary.prev_bgp_peers_not_established), deltaInverted: true },
    { label: "Lỗi thu thập", value: formatNumber(summary.bgp_collection_errors), tone: "medium", delta: d(summary.bgp_collection_errors, summary.prev_bgp_collection_errors), deltaInverted: true },
    { label: "Peer flap tăng", value: formatNumber(summary.bgp_flap_increased ?? 0), tone: "high" },
    { label: "Tổng flap tăng", value: formatNumber(summary.bgp_flap_total_increase ?? 0), tone: "critical" },
  ];

  const ospfItems: StatItem[] = [
    { label: "Neighbor chưa Full", value: formatNumber(summary.ospf_neighbors_not_full), tone: "high", delta: d(summary.ospf_neighbors_not_full, summary.prev_ospf_neighbors_not_full), deltaInverted: true },
    { label: "Neighbor biến mất", value: formatNumber(summary.ospf_neighbors_disappeared ?? 0), tone: "critical" },
    { label: "Lỗi thu thập", value: formatNumber(summary.ospf_collection_errors), tone: "medium", delta: d(summary.ospf_collection_errors, summary.prev_ospf_collection_errors), deltaInverted: true },
  ];

  return (
    <StatStripGroup
      sections={[
        { title: "BGP", items: bgpItems },
        { title: "OSPF", items: ospfItems },
      ]}
    />
  );
}

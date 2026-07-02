import { useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import { fetchDashboardSummary, fetchTopFindings, fetchTopReclaimCandidates, fetchTopOspfNotFull, fetchTopBgpHighFlaps, fetchTopHwAlarmCritical } from "../data/dashboard";
import type { AuditFinding, BgpNeighbor, DashboardSummary, HwAlarmSummary, OspfNeighbor, ResourceCandidate } from "../types";
import { PageHeader } from "../components/PageHeader";
import { StatStrip } from "../components/StatStrip";
import { RoutingHealthMetrics } from "../components/RoutingHealthMetrics";
import { DataTable, type Column } from "../components/DataTable";
import { SeverityBadge } from "../components/SeverityBadge";
import { RuleLabel } from "../components/RuleLabel";
import { ReasonList } from "../components/ReasonList";
import { FindingDetail } from "../components/FindingDetail";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { ErrorBanner } from "../components/ErrorBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { IpLink } from "../components/IpLink";
import type { DetailSubject } from "../data/detail";
import { batchDelta, formatDateTime, formatNumber, valueOrDash } from "../lib/format";

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [topFindings, setTopFindings] = useState<AuditFinding[]>([]);
  const [topReclaim, setTopReclaim] = useState<ResourceCandidate[]>([]);
  const [topOspfNotFull, setTopOspfNotFull] = useState<OspfNeighbor[]>([]);
  const [topBgpFlaps, setTopBgpFlaps] = useState<BgpNeighbor[]>([]);
  const [topHwAlarm, setTopHwAlarm] = useState<HwAlarmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<DetailSubject | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchDashboardSummary(),
      fetchTopFindings(10),
      fetchTopReclaimCandidates(10),
      fetchTopOspfNotFull(10),
      fetchTopBgpHighFlaps(10),
      fetchTopHwAlarmCritical(10),
    ])
      .then(([s, f, r, ospf, bgp, hwa]) => {
        if (cancelled) return;
        setSummary(s);
        setTopFindings(f);
        setTopReclaim(r);
        setTopOspfNotFull(ospf);
        setTopBgpFlaps(bgp);
        setTopHwAlarm(hwa);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const findingColumns: Column<AuditFinding>[] = [
    { key: "severity", header: "Mức độ", render: (r) => <SeverityBadge severity={r.severity} />, sortable: true, sortAccessor: (r) => r.severity },
    { key: "category", header: "Nhóm", render: (r) => r.category, sortable: true, sortAccessor: (r) => r.category },
    { key: "rule_code", header: "Rule", render: (r) => <RuleLabel code={r.rule_code} />, sortable: true, sortAccessor: (r) => r.rule_code },
    { key: "title", header: "Tiêu đề", render: (r) => r.title, className: "max-w-md", sortable: true, sortAccessor: (r) => r.title },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    {
      key: "ip_address",
      header: "IP / Network",
      render: (r) => <IpLink value={r.ip_address ?? r.network} />,
      sortable: true,
      sortAccessor: (r) => r.ip_address ?? r.network,
    },
    { key: "interface_name", header: "Interface", render: (r) => valueOrDash(r.interface_name), sortable: true, sortAccessor: (r) => r.interface_name },
    {
      key: "detail",
      header: "Chi tiết",
      render: (r) => <FindingDetail detail={r.detail} />,
      className: "max-w-md",
      sortable: true,
      sortAccessor: (r) => r.detail,
    },
    { key: "status", header: "Xử lý", render: (r) => <StatusBadge value={r.status} />, sortable: true, sortAccessor: (r) => r.status },
    { key: "priority_score", header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortable: true, sortAccessor: (r) => r.priority_score },
  ];

  const ospfNotFullColumns: Column<OspfNeighbor>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "neighbor_ip", header: "Neighbor IP", render: (r) => <IpLink value={r.neighbor_ip} />, sortable: true, sortAccessor: (r) => r.neighbor_ip },
    { key: "neighbor_router_id", header: "Neighbor Router ID", render: (r) => valueOrDash(r.neighbor_router_id), sortable: true, sortAccessor: (r) => r.neighbor_router_id },
    { key: "neighbor_device_name", header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortable: true, sortAccessor: (r) => r.neighbor_device_name },
    { key: "neighbor_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.neighbor_state} />, sortable: true, sortAccessor: (r) => r.neighbor_state },
    {
      key: "prev_neighbor_state",
      header: "Trạng thái cũ",
      render: (r) => r.prev_neighbor_state ? <StatusBadge value={r.prev_neighbor_state} /> : <span className="text-slate-300">—</span>,
      sortable: true,
      sortAccessor: (r) => r.prev_neighbor_state,
    },
  ];

  const bgpFlapsColumns: Column<BgpNeighbor>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "neighbor_ip", header: "Neighbor IP", render: (r) => <IpLink value={r.neighbor_ip} />, sortable: true, sortAccessor: (r) => r.neighbor_ip },
    { key: "neighbor_device_name", header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortable: true, sortAccessor: (r) => r.neighbor_device_name },
    { key: "remote_as", header: "Remote AS", render: (r) => valueOrDash(r.remote_as), sortable: true, sortAccessor: (r) => r.remote_as },
    { key: "bgp_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.bgp_state} />, sortable: true, sortAccessor: (r) => r.bgp_state },
    { key: "flaps", header: "Flaps", render: (r) => formatNumber(r.flaps), sortable: true, sortAccessor: (r) => r.flaps },
    {
      key: "flap_delta",
      header: "Flap Δ",
      render: (r) => {
        if (r.flap_delta == null) return <span className="text-slate-300">—</span>;
        if (r.flap_delta === 0) return <span className="text-slate-400">0</span>;
        const color = r.flap_delta > 0 ? "text-red-600 font-semibold" : "text-emerald-600";
        const arrow = r.flap_delta > 0 ? "↑" : "↓";
        return <span className={color}>{arrow}{Math.abs(r.flap_delta).toLocaleString("en-US")}</span>;
      },
      sortable: true,
      sortAccessor: (r) => r.flap_delta,
    },
    { key: "up_down", header: "Up/Down", render: (r) => valueOrDash(r.up_down), sortable: true, sortAccessor: (r) => r.up_down },
    { key: "last_error", header: "Lỗi gần nhất", render: (r) => valueOrDash(r.last_error), className: "max-w-xs", sortable: true, sortAccessor: (r) => r.last_error },
  ];

  const reclaimColumns: Column<ResourceCandidate>[] = [
    { key: "confidence", header: "Độ tin cậy", render: (r) => <StatusBadge value={r.confidence} />, sortable: true, sortAccessor: (r) => r.confidence },
    { key: "candidate_type", header: "Loại", render: (r) => r.candidate_type, sortable: true, sortAccessor: (r) => r.candidate_type },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    {
      key: "ip_address",
      header: "IP / Network",
      render: (r) => <IpLink value={r.ip_address ?? r.network} />,
      sortable: true,
      sortAccessor: (r) => r.ip_address ?? r.network,
    },
    { key: "interface_name", header: "Interface", render: (r) => valueOrDash(r.interface_name), sortable: true, sortAccessor: (r) => r.interface_name },
    { key: "service_type", header: "Dịch vụ", render: (r) => valueOrDash(r.service_type), sortable: true, sortAccessor: (r) => r.service_type },
    {
      key: "current_status",
      header: "Trạng thái hiện tại",
      render: (r) => <StatusBadge value={r.current_status} />,
      sortable: true,
      sortAccessor: (r) => r.current_status,
    },
    { key: "score", header: "Điểm", render: (r) => formatNumber(r.score), sortable: true, sortAccessor: (r) => r.score },
    { key: "priority_score", header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortable: true, sortAccessor: (r) => r.priority_score },
    { key: "reason", header: "Lý do", render: (r) => <ReasonList reason={r.reason} />, className: "max-w-md", sortable: true, sortAccessor: (r) => r.reason },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Tổng quan" description="Tổng quan inventory mạng, kiểm tra và thu hồi tài nguyên" />
        <LoadingState label="Đang tải tổng quan..." />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Tổng quan" description="Tổng quan inventory mạng, kiểm tra và thu hồi tài nguyên" />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!summary || !summary.latest_batch_id) {
    return (
      <div>
        <PageHeader title="Tổng quan" description="Tổng quan inventory mạng, kiểm tra và thu hồi tài nguyên" />
        <EmptyState
          icon={UploadCloud}
          title="Chưa có batch import nào"
          description='Chạy "npm run import:samples" để nạp các file Excel mẫu vào Supabase, sau đó tải lại trang này.'
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Tổng quan"
          description={`Lần import gần nhất: ${valueOrDash(summary.latest_batch_source_label)} — ${formatDateTime(
            summary.latest_batch_created_at
          )}`}
          className=""
        />
        {summary.prev_batch_id && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-card">
            <span className="font-semibold text-slate-700">
              So với: {valueOrDash(summary.prev_batch_source_label)} — {formatDateTime(summary.prev_batch_created_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-bold text-slate-700">↑↓</span> tăng / giảm
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-bold text-slate-500">=</span> không đổi
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-bold text-severity-ok">xanh</span> tích cực
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-bold text-severity-critical">đỏ</span> cần lưu ý
            </span>
          </div>
        )}
      </div>

      {(() => {
        const hasPrev = summary.prev_batch_id != null;
        const d = (curr: number | null | undefined, prev: number | null | undefined) => batchDelta(hasPrev, curr, prev);
        return (
          <>
            <StatStrip
              title="Inventory mạng"
              items={[
                { label: "Thiết bị", value: formatNumber(summary.total_devices), delta: d(summary.total_devices, summary.prev_total_devices) },
                { label: "Bản ghi IP", value: formatNumber(summary.total_ip_assignments), delta: d(summary.total_ip_assignments, summary.prev_total_ip_assignments) },
                { label: "Active", value: formatNumber(summary.status_active), tone: "ok", delta: d(summary.status_active, summary.prev_status_active) },
                { label: "Admin-Down", value: formatNumber(summary.status_admin_down), tone: "low", delta: d(summary.status_admin_down, summary.prev_status_admin_down), deltaInverted: true },
                { label: "Link-Down", value: formatNumber(summary.status_link_down), tone: "critical", delta: d(summary.status_link_down, summary.prev_status_link_down), deltaInverted: true },
                { label: "Up / No-Peer", value: formatNumber(summary.status_up_no_peer), tone: "medium", delta: d(summary.status_up_no_peer, summary.prev_status_up_no_peer), deltaInverted: true },
                { label: "Failed", value: formatNumber(summary.status_failed), tone: "critical", delta: d(summary.status_failed, summary.prev_status_failed), deltaInverted: true },
                { label: "IP trùng", value: formatNumber(summary.duplicate_ip_count), tone: "high", delta: d(summary.duplicate_ip_count, summary.prev_duplicate_ip_count), deltaInverted: true },
              ]}
            />

            <StatStrip
              title="Cảnh báo phần cứng"
              items={[
                { label: "Thiết bị kiểm tra", value: formatNumber(summary.hw_alarm_total_devices), delta: d(summary.hw_alarm_total_devices, summary.prev_hw_alarm_total_devices) },
                { label: "Critical", value: formatNumber(summary.hw_alarm_critical), tone: "critical", delta: d(summary.hw_alarm_critical, summary.prev_hw_alarm_critical), deltaInverted: true },
                { label: "Warning", value: formatNumber(summary.hw_alarm_warning), tone: "medium", delta: d(summary.hw_alarm_warning, summary.prev_hw_alarm_warning), deltaInverted: true },
                { label: "OK", value: formatNumber(summary.hw_alarm_ok), tone: "ok", delta: d(summary.hw_alarm_ok, summary.prev_hw_alarm_ok) },
                { label: "Alarm Critical", value: formatNumber(summary.hw_alarm_detail_critical), tone: "critical", delta: d(summary.hw_alarm_detail_critical, summary.prev_hw_alarm_detail_critical), deltaInverted: true },
                { label: "Alarm Major", value: formatNumber(summary.hw_alarm_detail_major), tone: "high", delta: d(summary.hw_alarm_detail_major, summary.prev_hw_alarm_detail_major), deltaInverted: true },
                { label: "Alarm Minor", value: formatNumber(summary.hw_alarm_detail_minor), tone: "low", delta: d(summary.hw_alarm_detail_minor, summary.prev_hw_alarm_detail_minor), deltaInverted: true },
                { label: "Lỗi thu thập", value: formatNumber(summary.hw_alarm_collection_errors), tone: "critical", delta: d(summary.hw_alarm_collection_errors, summary.prev_hw_alarm_collection_errors), deltaInverted: true },
              ]}
            />

            <StatStrip
              title="Phát hiện kiểm tra theo mức độ (IP + định tuyến)"
              items={[
                { label: "Critical", value: formatNumber(summary.findings_critical), tone: "critical", delta: d(summary.findings_critical, summary.prev_findings_critical), deltaInverted: true },
                { label: "High", value: formatNumber(summary.findings_high), tone: "high", delta: d(summary.findings_high, summary.prev_findings_high), deltaInverted: true },
                { label: "Medium", value: formatNumber(summary.findings_medium), tone: "medium", delta: d(summary.findings_medium, summary.prev_findings_medium), deltaInverted: true },
                { label: "Low", value: formatNumber(summary.findings_low), tone: "low", delta: d(summary.findings_low, summary.prev_findings_low), deltaInverted: true },
                { label: "Info", value: formatNumber(summary.findings_info), tone: "info", delta: d(summary.findings_info, summary.prev_findings_info), deltaInverted: true },
                { label: "Tổng phát hiện", value: formatNumber(summary.findings_total), delta: d(summary.findings_total, summary.prev_findings_total), deltaInverted: true },
                { label: "Mới phát sinh", value: formatNumber(summary.findings_new ?? 0), tone: "high" },
                { label: "Đã xử lý", value: formatNumber(summary.findings_resolved ?? 0), tone: "ok" },
              ]}
            />

            <RoutingHealthMetrics summary={summary} />

            <StatStrip
              title="Thu hồi tài nguyên"
              items={[
                { label: "Tổng ứng viên", value: formatNumber(summary.reclaim_total), delta: d(summary.reclaim_total, summary.prev_reclaim_total) },
                { label: "Độ tin cậy High", value: formatNumber(summary.reclaim_high), tone: "ok", delta: d(summary.reclaim_high, summary.prev_reclaim_high) },
                { label: "Độ tin cậy Medium", value: formatNumber(summary.reclaim_medium), tone: "medium", delta: d(summary.reclaim_medium, summary.prev_reclaim_medium) },
                { label: "Độ tin cậy Low", value: formatNumber(summary.reclaim_low), tone: "low", delta: d(summary.reclaim_low, summary.prev_reclaim_low) },
              ]}
            />
          </>
        );
      })()}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-800">Cảnh báo phần cứng — Thiết bị Critical / Warning (top 10)</h2>
        <DataTable
          columns={[
            { key: "device_name", header: "Thiết bị", render: (r: HwAlarmSummary) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r: HwAlarmSummary) => r.device_name },
            { key: "device_ip", header: "Device IP", render: (r: HwAlarmSummary) => <IpLink value={r.device_ip} />, sortable: true, sortAccessor: (r: HwAlarmSummary) => r.device_ip },
            { key: "vendor", header: "Vendor", render: (r: HwAlarmSummary) => valueOrDash(r.vendor), sortable: true, sortAccessor: (r: HwAlarmSummary) => r.vendor },
            { key: "overall_status", header: "Tổng thể", render: (r: HwAlarmSummary) => <StatusBadge value={r.overall_status} />, sortable: true, sortAccessor: (r: HwAlarmSummary) => r.overall_status },
            { key: "critical", header: "Critical", render: (r: HwAlarmSummary) => <span className={r.critical > 0 ? "font-semibold text-red-600" : ""}>{formatNumber(r.critical)}</span>, sortable: true, sortAccessor: (r: HwAlarmSummary) => r.critical },
            { key: "major", header: "Major", render: (r: HwAlarmSummary) => <span className={r.major > 0 ? "font-medium text-amber-600" : ""}>{formatNumber(r.major)}</span>, sortable: true, sortAccessor: (r: HwAlarmSummary) => r.major },
            { key: "minor", header: "Minor", render: (r: HwAlarmSummary) => formatNumber(r.minor), sortable: true, sortAccessor: (r: HwAlarmSummary) => r.minor },
            { key: "power_status", header: "Power", render: (r: HwAlarmSummary) => valueOrDash(r.power_status), className: "max-w-[10rem]", sortable: true, sortAccessor: (r: HwAlarmSummary) => r.power_status },
            { key: "fan_status", header: "Fan", render: (r: HwAlarmSummary) => valueOrDash(r.fan_status), className: "max-w-[10rem]", sortable: true, sortAccessor: (r: HwAlarmSummary) => r.fan_status },
            { key: "max_temp", header: "Nhiệt độ max", render: (r: HwAlarmSummary) => valueOrDash(r.max_temp), sortable: true, sortAccessor: (r: HwAlarmSummary) => r.max_temp },
          ] as Column<HwAlarmSummary>[]}
          rows={topHwAlarm}
          rowKey={(r) => r.id}
          emptyTitle="Không có thiết bị Critical/Warning"
          emptyDescription="Tất cả thiết bị phần cứng đều ở trạng thái OK hoặc chưa có dữ liệu hw_alarm."
          onRowClick={(r) => setSubject({ ipAddress: r.device_ip, deviceName: r.device_name })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-800">Phát hiện kiểm tra — Top 10 nổi bật (IP + định tuyến)</h2>
        <DataTable
          columns={findingColumns}
          rows={topFindings}
          rowKey={(r) => r.id}
          emptyTitle="Không có phát hiện"
          emptyDescription="Lần import gần nhất không tạo ra phát hiện nào."
          onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
        />
      </section>

      <section className="space-y-6">
        <h2 className="text-base font-bold text-slate-800">Tình trạng định tuyến — Nổi bật</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-600">OSPF Neighbor chưa Full (top 10)</h3>
          <DataTable
            columns={ospfNotFullColumns}
            rows={topOspfNotFull}
            rowKey={(r) => r.id}
            emptyTitle="Tất cả OSPF neighbor đều Full"
            emptyDescription="Không có OSPF neighbor nào ở trạng thái chưa Full."
            onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-600">BGP Peer có Flap cao / tăng (top 10)</h3>
          <DataTable
            columns={bgpFlapsColumns}
            rows={topBgpFlaps}
            rowKey={(r) => r.id}
            emptyTitle="Không có BGP peer nào flap"
            emptyDescription="Không có BGP peer nào có flap hoặc flap tăng so với batch trước."
            onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-800">Thu hồi tài nguyên — Top 10 ứng viên nổi bật</h2>
        <DataTable
          columns={reclaimColumns}
          rows={topReclaim}
          rowKey={(r) => r.id}
          emptyTitle="Không có ứng viên thu hồi"
          emptyDescription="Lần import gần nhất không tạo ra ứng viên thu hồi nào."
          onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
        />
      </section>

      <DetailDrawer subject={subject} onClose={() => setSubject(null)} />
    </div>
  );
}

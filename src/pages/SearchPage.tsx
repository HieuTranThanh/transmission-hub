import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Search as SearchIcon } from "lucide-react";
import { search } from "../data/search";
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
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { ExportButton } from "../components/FilterBar";
import { SeverityBadge } from "../components/SeverityBadge";
import { StatusBadge } from "../components/StatusBadge";
import { ReasonList } from "../components/ReasonList";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { ErrorBanner } from "../components/ErrorBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { IpLink } from "../components/IpLink";
import type { DetailSubject } from "../data/detail";
import {
  exportSheets,
  INVENTORY_COLUMNS,
  BGP_SUMMARY_COLUMNS,
  BGP_NEIGHBOR_COLUMNS,
  OSPF_INTERFACE_COLUMNS,
  OSPF_NEIGHBOR_COLUMNS,
  SEARCH_FINDING_COLUMNS,
  SEARCH_RECLAIM_COLUMNS,
  SEARCH_HW_ALARM_SUMMARY_COLUMNS,
} from "../lib/export";
import { formatNumber, todayStamp, valueOrDash } from "../lib/format";

const QUERY_TYPE_LABELS: Record<SearchQueryType, string> = {
  ip: "Địa chỉ IP",
  subnet: "Subnet (CIDR)",
  vlan: "VLAN ID",
  text: "Tìm theo văn bản",
};

// Inventory result scope for text search: config that lives ON the matched
// device vs. the device being referenced in OTHER devices' declarations.
type InventoryScope = "all" | "device" | "referenced";

const SCOPE_TABS: { id: InventoryScope; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "device", label: "Trên thiết bị này" },
  { id: "referenced", label: "Tham chiếu nơi khác" },
];

/** Which reference field(s) a "referenced elsewhere" row matched on. */
function matchedFieldsLabel(row: IpAssignment, query: string): string {
  const q = query.toLowerCase();
  const hits: string[] = [];
  if (row.interface_name?.toLowerCase().includes(q)) hits.push("Interface");
  if (row.port_description?.toLowerCase().includes(q)) hits.push("Mô tả cổng");
  if (row.vlan_description?.toLowerCase().includes(q)) hits.push("Mô tả VLAN");
  if (row.vrf_instance?.toLowerCase().includes(q)) hits.push("VRF");
  return hits.join(", ") || "—";
}

function hasAnyResults(results: SearchResults): boolean {
  return (
    results.inventory.length > 0 ||
    results.inventoryReferenced.length > 0 ||
    results.inventoryNetwork.length > 0 ||
    results.bgpSummary.length > 0 ||
    results.bgpNeighbors.length > 0 ||
    results.ospfInterfaces.length > 0 ||
    results.ospfNeighbors.length > 0 ||
    results.ospfNeighborsReferenced.length > 0 ||
    results.findings.length > 0 ||
    results.reclaim.length > 0 ||
    results.hwAlarmSummary.length > 0
  );
}

interface ResultSectionProps<T> {
  title: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick: (row: T) => void;
}

function ResultSection<T>({ title, columns, rows, rowKey, onRowClick }: ResultSectionProps<T>) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-slate-800">
        {title} <span className="font-normal text-slate-400">({rows.length})</span>
      </h2>
      <DataTable columns={columns} rows={rows} rowKey={rowKey} onRowClick={onRowClick} />
    </section>
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";

  const [inputValue, setInputValue] = useState(queryParam);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<DetailSubject | null>(null);
  const [scope, setScope] = useState<InventoryScope>("all");

  useEffect(() => {
    setInputValue(queryParam);
    setScope("all");
  }, [queryParam]);

  useEffect(() => {
    if (!queryParam.trim()) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    search(queryParam)
      .then((res) => {
        if (cancelled) return;
        setResults(res);
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
  }, [queryParam]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSearchParams({ q: trimmed });
  }

  function handleExport() {
    if (!results) return;
    const q = results.query;
    exportSheets(`search-results-${todayStamp()}.xlsx`, [
      { name: "Inventory", columns: INVENTORY_COLUMNS, rows: results.inventory, title: `Inventory — "${q}"` },
      { name: "Inventory (tham chiếu)", columns: INVENTORY_COLUMNS, rows: results.inventoryReferenced, title: `Inventory tham chiếu — "${q}"` },
      { name: "Inventory (dải mạng)", columns: INVENTORY_COLUMNS, rows: results.inventoryNetwork, title: `Inventory dải mạng — "${q}"` },
      { name: "BGP Summary", columns: BGP_SUMMARY_COLUMNS, rows: results.bgpSummary, title: `BGP Summary — "${q}"` },
      { name: "BGP Neighbors", columns: BGP_NEIGHBOR_COLUMNS, rows: results.bgpNeighbors, title: `BGP Neighbors — "${q}"` },
      { name: "OSPF Interfaces", columns: OSPF_INTERFACE_COLUMNS, rows: results.ospfInterfaces, title: `OSPF Interfaces — "${q}"` },
      { name: "OSPF Neighbors", columns: OSPF_NEIGHBOR_COLUMNS, rows: results.ospfNeighbors, title: `OSPF Neighbors — "${q}"` },
      { name: "OSPF Neighbors (tham chiếu)", columns: OSPF_NEIGHBOR_COLUMNS, rows: results.ospfNeighborsReferenced, title: `OSPF Neighbors tham chiếu — "${q}"` },
      { name: "Audit Findings", columns: SEARCH_FINDING_COLUMNS, rows: results.findings, title: `Phát hiện kiểm tra — "${q}"` },
      { name: "Reclaim Candidates", columns: SEARCH_RECLAIM_COLUMNS, rows: results.reclaim, title: `Ứng viên thu hồi — "${q}"` },
      { name: "HW Alarm", columns: SEARCH_HW_ALARM_SUMMARY_COLUMNS, rows: results.hwAlarmSummary, title: `Cảnh báo phần cứng — "${q}"` },
    ]).catch((err: Error) => setError(err.message));
  }

  const inventoryColumns: Column<IpAssignment>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "interface_name", header: "Interface", render: (r) => valueOrDash(r.interface_name), sortable: true, sortAccessor: (r) => r.interface_name },
    {
      key: "physical_port",
      header: "Cổng vật lý",
      render: (r) =>
        r.physical_port || r.port_description ? (
          <div className="min-w-0">
            <div className="font-mono text-sm text-slate-700">{valueOrDash(r.physical_port)}</div>
            {r.port_description && (
              <div className="max-w-[16rem] truncate text-sm text-slate-500" title={r.port_description}>
                {r.port_description}
              </div>
            )}
          </div>
        ) : (
          "—"
        ),
      sortable: true,
      sortAccessor: (r) => r.physical_port,
    },
    {
      key: "ip",
      header: "IP / Prefix",
      render: (r) =>
        r.ip_address ? (
          <>
            <IpLink value={r.ip_address} />
            <span className="text-slate-400">/{r.prefix_length ?? "?"}</span>
          </>
        ) : (
          "—"
        ),
      sortable: true,
      sortAccessor: (r) => r.ip_address,
    },
    { key: "vlan_id", header: "VLAN", render: (r) => valueOrDash(r.vlan_id), sortable: true, sortAccessor: (r) => r.vlan_id },
    { key: "vrf_instance", header: "VRF", render: (r) => valueOrDash(r.vrf_instance), sortable: true, sortAccessor: (r) => r.vrf_instance },
    { key: "service_type", header: "Dịch vụ", render: (r) => valueOrDash(r.service_type), sortable: true, sortAccessor: (r) => r.service_type },
    { key: "gateway", header: "Gateway", render: (r) => <IpLink value={r.gateway} />, sortable: true, sortAccessor: (r) => r.gateway },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge value={r.status} />, sortable: true, sortAccessor: (r) => r.status },
  ];

  // Group B ("referenced elsewhere") reuses the inventory columns plus a
  // "Khớp ở" column explaining which field caused the row to match.
  const referencedColumns: Column<IpAssignment>[] = [
    ...inventoryColumns,
    {
      key: "matched",
      header: "Khớp ở",
      render: (r) => (
        <span className="whitespace-nowrap text-sm text-slate-500">{matchedFieldsLabel(r, results?.query ?? "")}</span>
      ),
    },
  ];

  // For "IP found within an allocated network" results, the searched IP
  // isn't any column value directly — show the containing subnet so the
  // match is explainable.
  const networkColumns: Column<IpAssignment>[] = [
    ...inventoryColumns,
    { key: "network", header: "Dải mạng", render: (r) => <IpLink value={r.network} />, sortable: true, sortAccessor: (r) => r.network },
  ];

  const bgpSummaryColumns: Column<BgpSummary>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "router_id", header: "Router ID", render: (r) => <IpLink value={r.router_id} />, sortable: true, sortAccessor: (r) => r.router_id },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge value={r.status} />, sortable: true, sortAccessor: (r) => r.status },
    {
      key: "established",
      header: "Established / Total",
      render: (r) => `${formatNumber(r.established)} / ${formatNumber(r.total_peers)}`,
      sortable: true,
      sortAccessor: (r) => r.established,
    },
    {
      key: "vpnv4",
      header: "VPNv4 Active / Rcvd",
      render: (r) => `${formatNumber(r.vpnv4_active)} / ${formatNumber(r.vpnv4_rcvd)}`,
      sortable: true,
      sortAccessor: (r) => r.vpnv4_active,
    },
  ];

  const bgpNeighborColumns: Column<BgpNeighbor>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "neighbor_ip", header: "Neighbor IP", render: (r) => <IpLink value={r.neighbor_ip} />, sortable: true, sortAccessor: (r) => r.neighbor_ip },
    { key: "neighbor_device_name", header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortable: true, sortAccessor: (r) => r.neighbor_device_name },
    { key: "remote_as", header: "Remote AS", render: (r) => valueOrDash(r.remote_as), sortable: true, sortAccessor: (r) => r.remote_as },
    { key: "bgp_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.bgp_state} />, sortable: true, sortAccessor: (r) => r.bgp_state },
    { key: "flaps", header: "Flaps", render: (r) => formatNumber(r.flaps), sortable: true, sortAccessor: (r) => r.flaps },
    { key: "last_error", header: "Lỗi gần nhất", render: (r) => valueOrDash(r.last_error), className: "max-w-xs", sortable: true, sortAccessor: (r) => r.last_error },
  ];

  const ospfInterfaceColumns: Column<OspfInterface>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "if_name", header: "Interface", render: (r) => valueOrDash(r.if_name), sortable: true, sortAccessor: (r) => r.if_name },
    { key: "if_ip", header: "IF IP", render: (r) => <IpLink value={r.if_ip} />, sortable: true, sortAccessor: (r) => r.if_ip },
    { key: "area", header: "Area", render: (r) => valueOrDash(r.area), sortable: true, sortAccessor: (r) => r.area },
    { key: "if_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.if_state} />, sortable: true, sortAccessor: (r) => r.if_state },
    { key: "cost", header: "Cost", render: (r) => formatNumber(r.cost), sortable: true, sortAccessor: (r) => r.cost },
  ];

  const ospfNeighborColumns: Column<OspfNeighbor>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "neighbor_ip", header: "Neighbor IP", render: (r) => <IpLink value={r.neighbor_ip} />, sortable: true, sortAccessor: (r) => r.neighbor_ip },
    { key: "neighbor_device_name", header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortable: true, sortAccessor: (r) => r.neighbor_device_name },
    { key: "neighbor_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.neighbor_state} />, sortable: true, sortAccessor: (r) => r.neighbor_state },
  ];

  const findingColumns: Column<AuditFinding>[] = [
    { key: "severity", header: "Mức độ", render: (r) => <SeverityBadge severity={r.severity} />, sortable: true, sortAccessor: (r) => r.severity },
    { key: "category", header: "Nhóm", render: (r) => r.category, sortable: true, sortAccessor: (r) => r.category },
    { key: "title", header: "Tiêu đề", render: (r) => r.title, className: "max-w-md", sortable: true, sortAccessor: (r) => r.title },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "priority_score", header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortable: true, sortAccessor: (r) => r.priority_score },
  ];

  const hwAlarmColumns: Column<HwAlarmSummary>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "device_ip", header: "Device IP", render: (r) => valueOrDash(r.device_ip), sortable: true, sortAccessor: (r) => r.device_ip },
    { key: "vendor", header: "Vendor", render: (r) => valueOrDash(r.vendor), sortable: true, sortAccessor: (r) => r.vendor },
    { key: "overall_status", header: "Tổng thể", render: (r) => <StatusBadge value={r.overall_status} />, sortable: true, sortAccessor: (r) => r.overall_status },
    { key: "critical", header: "Critical", render: (r) => formatNumber(r.critical), sortable: true, sortAccessor: (r) => r.critical },
    { key: "major", header: "Major", render: (r) => formatNumber(r.major), sortable: true, sortAccessor: (r) => r.major },
    { key: "minor", header: "Minor", render: (r) => formatNumber(r.minor), sortable: true, sortAccessor: (r) => r.minor },
    { key: "power_status", header: "Power", render: (r) => valueOrDash(r.power_status), className: "max-w-[10rem]", sortable: true, sortAccessor: (r) => r.power_status },
    { key: "fan_status", header: "Fan", render: (r) => valueOrDash(r.fan_status), className: "max-w-[10rem]", sortable: true, sortAccessor: (r) => r.fan_status },
    { key: "max_temp", header: "Nhiệt độ max", render: (r) => valueOrDash(r.max_temp), sortable: true, sortAccessor: (r) => r.max_temp },
  ];

  const reclaimColumns: Column<ResourceCandidate>[] = [
    { key: "confidence", header: "Độ tin cậy", render: (r) => <StatusBadge value={r.confidence} />, sortable: true, sortAccessor: (r) => r.confidence },
    { key: "candidate_type", header: "Loại", render: (r) => r.candidate_type, sortable: true, sortAccessor: (r) => r.candidate_type },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "interface_name", header: "Interface", render: (r) => valueOrDash(r.interface_name), sortable: true, sortAccessor: (r) => r.interface_name },
    { key: "score", header: "Điểm", render: (r) => formatNumber(r.score), sortable: true, sortAccessor: (r) => r.score },
    { key: "reason", header: "Lý do", render: (r) => <ReasonList reason={r.reason} />, className: "max-w-md", sortable: true, sortAccessor: (r) => r.reason },
  ];

  // The scope toggle is a global lens for a text search. "Trên thiết bị này"
  // shows config that lives ON the matched device (every table keyed by
  // device_name). "Tham chiếu nơi khác" shows only the tables where the
  // matched station is the far-end: inventory references + OSPF neighbors that
  // list it as neighbor_device_name.
  const isTextQuery = results?.queryType === "text";
  const showOnDevice = !isTextQuery || scope !== "referenced";
  const showReferenced = !!isTextQuery && scope !== "device";
  const deviceCount = results
    ? results.inventory.length +
      results.bgpSummary.length +
      results.bgpNeighbors.length +
      results.ospfInterfaces.length +
      results.ospfNeighbors.length +
      results.findings.length +
      results.reclaim.length +
      results.hwAlarmSummary.length
    : 0;
  const referencedCount = results ? results.inventoryReferenced.length + results.ospfNeighborsReferenced.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm tra cứu"
        description="Tra cứu địa chỉ IP, subnet, VLAN ID, tên thiết bị hoặc interface trên toàn bộ dữ liệu."
      />

      <form onSubmit={submit} className="flex max-w-2xl gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="vd: 10.250.60.137, 10.250.60.136/30, 120, R-CORE-01, GigabitEthernet0/0/1"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          Tìm kiếm
        </button>
      </form>

      {!queryParam.trim() && (
        <EmptyState
          icon={SearchIcon}
          title="Tra cứu dữ liệu mạng"
          description="Nhập địa chỉ IP, subnet (CIDR), VLAN ID, tên thiết bị hoặc interface để tìm trên inventory, BGP, OSPF, phát hiện kiểm tra và ứng viên thu hồi."
        />
      )}

      {loading && <LoadingState label="Đang tìm..." />}
      {error && <ErrorBanner message={error} />}

      {!loading && results && queryParam.trim() && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Loại tra cứu nhận diện: <span className="font-medium text-slate-700">{QUERY_TYPE_LABELS[results.queryType]}</span>
              {" — "}
              <span className="font-mono">{results.query}</span>
            </p>
            <ExportButton disabled={!hasAnyResults(results)} onClick={handleExport} />
          </div>

          {!hasAnyResults(results) && (
            <EmptyState
              title="Không tìm thấy kết quả"
              description={`Không có gì trong lần import gần nhất khớp với "${results.query}".`}
            />
          )}

          {isTextQuery && deviceCount + referencedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-semibold text-slate-500">Phạm vi</span>
                <div className="flex gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1">
                  {SCOPE_TABS.map((s) => {
                    const count =
                      s.id === "device" ? deviceCount : s.id === "referenced" ? referencedCount : deviceCount + referencedCount;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setScope(s.id)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                          scope === s.id ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {s.label} <span className="text-slate-400">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {showOnDevice && (
            <ResultSection
              title={isTextQuery ? `Khai báo trên thiết bị "${results.query}"` : "Inventory"}
              columns={inventoryColumns}
              rows={results.inventory}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
            />
          )}

          {results.queryType === "ip" && (
            <ResultSection
              title={`"${results.query}" nằm trong dải mạng đã cấp cho`}
              columns={networkColumns}
              rows={results.inventoryNetwork}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
            />
          )}

          {showReferenced && (
            <ResultSection
              title={`"${results.query}" được tham chiếu trên thiết bị khác`}
              columns={referencedColumns}
              rows={results.inventoryReferenced}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title="Cảnh báo phần cứng"
              columns={hwAlarmColumns}
              rows={results.hwAlarmSummary}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.device_ip, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title="Phát hiện kiểm tra"
              columns={findingColumns}
              rows={results.findings}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title="BGP Summary"
              columns={bgpSummaryColumns}
              rows={results.bgpSummary}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.router_id, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title="BGP Neighbors"
              columns={bgpNeighborColumns}
              rows={results.bgpNeighbors}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title="OSPF Interfaces"
              columns={ospfInterfaceColumns}
              rows={results.ospfInterfaces}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.if_ip, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title={isTextQuery ? `OSPF neighbor của "${results.query}"` : "OSPF Neighbors"}
              columns={ospfNeighborColumns}
              rows={results.ospfNeighbors}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
            />
          )}

          {showReferenced && (
            <ResultSection
              title={`Thiết bị coi "${results.query}" là OSPF neighbor`}
              columns={ospfNeighborColumns}
              rows={results.ospfNeighborsReferenced}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
            />
          )}

          {showOnDevice && (
            <ResultSection
              title="Ứng viên thu hồi"
              columns={reclaimColumns}
              rows={results.reclaim}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
            />
          )}
        </>
      )}

      <DetailDrawer subject={subject} onClose={() => setSubject(null)} />
    </div>
  );
}

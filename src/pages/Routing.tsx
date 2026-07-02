import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "../data/dashboard";
import {
  fetchBgpNeighbors,
  fetchAllBgpNeighbors,
  fetchOspfNeighbors,
  fetchAllOspfNeighbors,
  fetchRoutingFindings,
  fetchAllRoutingFindings,
  fetchRoutingFilterRows,
  type RoutingFilterRow,
} from "../data/routing";
import type { AuditFinding, BgpNeighbor, DashboardSummary, OspfNeighbor, PagedResult, SortState } from "../types";
import { PageHeader } from "../components/PageHeader";
import { RoutingHealthMetrics } from "../components/RoutingHealthMetrics";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar, FilterInput, FilterMultiSelect, ExportButton, type MultiSelectOption } from "../components/FilterBar";
import { cascadingOptions } from "../lib/cascading-filters";
import { SeverityBadge } from "../components/SeverityBadge";
import { RuleLabel } from "../components/RuleLabel";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorBanner } from "../components/ErrorBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { IpLink } from "../components/IpLink";
import type { DetailSubject } from "../data/detail";
import { exportToExcel, withDeltaLabel, ROUTING_FINDING_COLUMNS, ROUTING_BGP_NEIGHBOR_COLUMNS, ROUTING_OSPF_NEIGHBOR_COLUMNS } from "../lib/export";
import { formatNumber, todayStamp, valueOrDash } from "../lib/format";
import { useDebouncedValue } from "../lib/use-debounced-value";

const PAGE_SIZE = 25;

type Tab = "findings" | "bgp" | "ospf";

const TABS: { id: Tab; label: string }[] = [
  { id: "findings", label: "Phát hiện định tuyến" },
  { id: "bgp", label: "BGP Peer" },
  { id: "ospf", label: "OSPF Neighbor" },
];

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low", "Info"];

const BGP_STATE_ITEMS: MultiSelectOption[] = [
  { value: "Established", label: "Established" },
  { value: "Not Established", label: "Chưa Established" },
];

const OSPF_STATE_ITEMS: MultiSelectOption[] = [
  { value: "Full", label: "Full" },
  { value: "Not Full", label: "Chưa Full" },
];

export function Routing() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tab, setTab] = useState<Tab>("findings");
  const [subject, setSubject] = useState<DetailSubject | null>(null);

  // Routing findings tab
  const [domain, setDomain] = useState<string[]>([]);
  const [findingsSeverity, setFindingsSeverity] = useState<string[]>([]);
  const [findingsRule, setFindingsRule] = useState<string[]>([]);
  const [filterRows, setFilterRows] = useState<RoutingFilterRow[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const [findingsSearch, setFindingsSearch] = useState("");
  const debouncedFindingsSearch = useDebouncedValue(findingsSearch);
  const [findingsSort, setFindingsSort] = useState<SortState | null>(null);
  const [findingsPage, setFindingsPage] = useState(0);
  const [findingsResult, setFindingsResult] = useState<PagedResult<AuditFinding>>({ rows: [], count: 0 });
  const [findingsLoading, setFindingsLoading] = useState(true);
  const [findingsError, setFindingsError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bgpExporting, setBgpExporting] = useState(false);
  const [ospfExporting, setOspfExporting] = useState(false);

  // BGP peers tab
  const [bgpState, setBgpState] = useState<string[]>(["Established", "Not Established"]);
  const [bgpSearch, setBgpSearch] = useState("");
  const debouncedBgpSearch = useDebouncedValue(bgpSearch);
  const [bgpSort, setBgpSort] = useState<SortState | null>(null);
  const [bgpPage, setBgpPage] = useState(0);
  const [bgpResult, setBgpResult] = useState<PagedResult<BgpNeighbor>>({ rows: [], count: 0 });
  const [bgpLoading, setBgpLoading] = useState(true);
  const [bgpError, setBgpError] = useState<string | null>(null);

  // OSPF neighbors tab
  const [ospfState, setOspfState] = useState<string[]>(["Full", "Not Full"]);
  const [ospfSearch, setOspfSearch] = useState("");
  const debouncedOspfSearch = useDebouncedValue(ospfSearch);
  const [ospfSort, setOspfSort] = useState<SortState | null>(null);
  const [ospfPage, setOspfPage] = useState(0);
  const [ospfResult, setOspfResult] = useState<PagedResult<OspfNeighbor>>({ rows: [], count: 0 });
  const [ospfLoading, setOspfLoading] = useState(true);
  const [ospfError, setOspfError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRoutingFilterRows()
      .then((rows) => {
        if (!cancelled) {
          setFilterRows(rows);
          const init = (pick: (r: RoutingFilterRow) => string | null | undefined) =>
            [...new Set(rows.map(pick).filter((v): v is string => !!v))];
          setDomain(init((r) => r.category));
          setFindingsRule(init((r) => r.rule_code));
          setFindingsSeverity(init((r) => r.severity));
          setFiltersReady(true);
        }
      })
      .catch(() => {
        /* If options can't load, filtersReady stays false so the findings table
           still shows all BGP/OSPF rows unfiltered (just with empty dropdowns)
           instead of getting stuck on an empty "[] = none selected" result. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Each filter's dropdown only offers values that can still produce a result
  // given the other filters' current selections — "linked"/cascading filters,
  // like Excel's column filters. See "Quy ước UI — Bộ lọc" in README.md.
  // "Giao thức" (Tất cả/BGP/OSPF) maps onto the `category` column.
  const routingSelections = { category: domain, rule_code: findingsRule, severity: findingsSeverity };
  const domainValues = cascadingOptions(filterRows, routingSelections, "category");
  const findingsRuleValues = cascadingOptions(filterRows, routingSelections, "rule_code");
  const findingsSeverityValues = cascadingOptions(filterRows, routingSelections, "severity");

  const orderedFindingsSeverityValues = SEVERITY_ORDER.filter((v) => findingsSeverityValues.includes(v));

  useEffect(() => {
    setFindingsPage(0);
  }, [domain, findingsSeverity, findingsRule, debouncedFindingsSearch, findingsSort]);

  useEffect(() => {
    if (tab !== "findings") return;
    let cancelled = false;
    setFindingsLoading(true);
    // Until the filter options have loaded, the multi-selects are still empty
    // ([] = "none selected" to the data layer). Send `undefined` ("no filter")
    // for that window so the first load shows all rows instead of an empty
    // flash, and a failed options load still renders data (just no dropdowns).
    const f = (v: string[]) => (filtersReady ? v : undefined);
    fetchRoutingFindings({
      domain: f(domain),
      severity: f(findingsSeverity),
      rule: f(findingsRule),
      search: debouncedFindingsSearch,
      sort: findingsSort,
      page: findingsPage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setFindingsResult(res);
        setFindingsError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setFindingsError(err.message);
      })
      .finally(() => {
        if (!cancelled) setFindingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, domain, findingsSeverity, findingsRule, debouncedFindingsSearch, findingsSort, findingsPage, filtersReady]);

  useEffect(() => {
    setBgpPage(0);
  }, [bgpState, debouncedBgpSearch, bgpSort]);

  useEffect(() => {
    if (tab !== "bgp") return;
    let cancelled = false;
    setBgpLoading(true);
    fetchBgpNeighbors({ state: bgpState, search: debouncedBgpSearch, sort: bgpSort, page: bgpPage, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setBgpResult(res);
        setBgpError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setBgpError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBgpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, bgpState, debouncedBgpSearch, bgpSort, bgpPage]);

  useEffect(() => {
    setOspfPage(0);
  }, [ospfState, debouncedOspfSearch, ospfSort]);

  useEffect(() => {
    if (tab !== "ospf") return;
    let cancelled = false;
    setOspfLoading(true);
    fetchOspfNeighbors({ state: ospfState, search: debouncedOspfSearch, sort: ospfSort, page: ospfPage, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setOspfResult(res);
        setOspfError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setOspfError(err.message);
      })
      .finally(() => {
        if (!cancelled) setOspfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, ospfState, debouncedOspfSearch, ospfSort, ospfPage]);

  const findingsColumns: Column<AuditFinding>[] = [
    {
      key: "is_new",
      header: "Δ",
      render: (r) => r.is_new
        ? <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">Mới</span>
        : <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">Không đổi</span>,
      sortable: true,
    },
    { key: "severity", header: "Mức độ", render: (r) => <SeverityBadge severity={r.severity} />, sortable: true },
    { key: "category", header: "Giao thức", render: (r) => r.category, sortable: true },
    { key: "rule_code", header: "Rule", render: (r) => <RuleLabel code={r.rule_code} />, sortable: true },
    { key: "title", header: "Tiêu đề", render: (r) => r.title, className: "max-w-md", sortable: true },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "ip_address", header: "IP", render: (r) => <IpLink value={r.ip_address} />, sortable: true },
    { key: "priority_score", header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortable: true },
  ];

  const bgpColumns: Column<BgpNeighbor>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "neighbor_ip", header: "Neighbor IP", render: (r) => <IpLink value={r.neighbor_ip} />, sortable: true },
    { key: "neighbor_device_name", header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortable: true },
    { key: "remote_as", header: "Remote AS", render: (r) => valueOrDash(r.remote_as), sortable: true },
    { key: "bgp_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.bgp_state} />, sortable: true },
    {
      key: "prev_bgp_state",
      header: "Trạng thái cũ",
      render: (r) => r.prev_bgp_state ? <StatusBadge value={r.prev_bgp_state} /> : <span className="text-slate-300">—</span>,
      sortable: true,
    },
    { key: "up_down", header: "Up/Down", render: (r) => valueOrDash(r.up_down), sortable: true },
    { key: "flaps", header: "Flaps", render: (r) => formatNumber(r.flaps), sortable: true },
    {
      key: "flap_delta",
      header: "Flap Δ",
      render: (r) => {
        if (r.flap_delta == null) return <span className="text-slate-300">—</span>;
        if (r.flap_delta === 0) return <span className="text-slate-400">0</span>;
        const color = r.flap_delta > 0 ? "text-red-600" : "text-emerald-600";
        const arrow = r.flap_delta > 0 ? "↑" : "↓";
        return <span className={`font-medium ${color}`}>{arrow}{Math.abs(r.flap_delta).toLocaleString("en-US")}</span>;
      },
      sortable: true,
    },
    {
      key: "vpnv4",
      header: "VPNv4 Active/Rcvd",
      render: (r) => `${formatNumber(r.vpnv4_active)} / ${formatNumber(r.vpnv4_rcvd)}`,
      sortable: true,
      sortKey: "vpnv4_active",
    },
    { key: "last_error", header: "Lỗi gần nhất", render: (r) => valueOrDash(r.last_error), className: "max-w-xs", sortable: true },
  ];

  const ospfColumns: Column<OspfNeighbor>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "neighbor_ip", header: "Neighbor IP", render: (r) => <IpLink value={r.neighbor_ip} />, sortable: true },
    { key: "neighbor_router_id", header: "Neighbor Router ID", render: (r) => valueOrDash(r.neighbor_router_id), sortable: true },
    { key: "neighbor_device_name", header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortable: true },
    { key: "neighbor_state", header: "Trạng thái", render: (r) => <StatusBadge value={r.neighbor_state} />, sortable: true },
    {
      key: "prev_neighbor_state",
      header: "Trạng thái cũ",
      render: (r) => r.prev_neighbor_state ? <StatusBadge value={r.prev_neighbor_state} /> : <span className="text-slate-300">—</span>,
      sortable: true,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Tình trạng định tuyến" description="Trạng thái BGP và OSPF, tình trạng peer/neighbor và lỗi thu thập." />

      {summary && <RoutingHealthMetrics summary={summary} />}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-0.5 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "-mb-px border-b-2 border-brand-600 text-brand-700"
                  : "border-b-2 border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "findings" && (
        <div className="space-y-4">
          <FilterBar>
            <FilterMultiSelect label="Giao thức" placeholder="Tất cả giao thức" options={domainValues} selected={domain} onChange={setDomain} countLabel="giao thức đã chọn" />
            <FilterMultiSelect label="Rule" placeholder="Tất cả rule" options={findingsRuleValues} selected={findingsRule} onChange={setFindingsRule} countLabel="rule đã chọn" />
            <FilterMultiSelect label="Mức độ" placeholder="Tất cả mức độ" options={orderedFindingsSeverityValues} selected={findingsSeverity} onChange={setFindingsSeverity} countLabel="mức độ đã chọn" />
            <FilterInput label="Tìm kiếm" value={findingsSearch} onChange={setFindingsSearch} placeholder="Tìm thiết bị, tiêu đề, rule..." />
            <ExportButton
              disabled={findingsResult.rows.length === 0}
              loading={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const f = (v: string[]) => (filtersReady ? v : undefined);
                  const raw = await fetchAllRoutingFindings({
                    domain: f(domain), severity: f(findingsSeverity), rule: f(findingsRule),
                    search: debouncedFindingsSearch,
                  });
                  const all = withDeltaLabel(raw);
                  await exportToExcel(
                    `routing-findings-${todayStamp()}.xlsx`,
                    "Routing Findings",
                    ROUTING_FINDING_COLUMNS,
                    all,
                    "Báo cáo phát hiện định tuyến",
                  );
                } catch (err: unknown) {
                  setFindingsError((err as Error).message);
                } finally {
                  setExporting(false);
                }
              }}
            />
          </FilterBar>

          {findingsError && <ErrorBanner message={findingsError} />}

          <DataTable
            columns={findingsColumns}
            rows={findingsResult.rows}
            rowKey={(r) => r.id}
            loading={findingsLoading}
            emptyTitle="Không có phát hiện định tuyến"
            emptyDescription="Không có phát hiện BGP/OSPF nào khớp bộ lọc hiện tại."
            onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
            sort={findingsSort}
            onSortChange={setFindingsSort}
            page={findingsPage}
            pageSize={PAGE_SIZE}
            totalCount={findingsResult.count}
            onPageChange={setFindingsPage}
          />
          <p className="text-sm text-slate-400">Export tải xuống toàn bộ dữ liệu khớp bộ lọc hiện tại.</p>
        </div>
      )}

      {tab === "bgp" && (
        <div className="space-y-4">
          <FilterBar>
            <FilterMultiSelect label="Trạng thái" placeholder="Tất cả trạng thái" options={BGP_STATE_ITEMS} selected={bgpState} onChange={setBgpState} countLabel="trạng thái đã chọn" />
            <FilterInput label="Tìm kiếm" value={bgpSearch} onChange={setBgpSearch} placeholder="Tìm thiết bị, neighbor IP, thiết bị neighbor, mô tả..." />
            <ExportButton
              disabled={bgpResult.rows.length === 0}
              loading={bgpExporting}
              onClick={async () => {
                setBgpExporting(true);
                try {
                  const all = await fetchAllBgpNeighbors({
                    state: bgpState, search: debouncedBgpSearch,
                  });
                  await exportToExcel(
                    `bgp-neighbors-${todayStamp()}.xlsx`,
                    "BGP Neighbors",
                    ROUTING_BGP_NEIGHBOR_COLUMNS,
                    all,
                    "Báo cáo BGP Peer",
                  );
                } catch (err: unknown) {
                  setBgpError((err as Error).message);
                } finally {
                  setBgpExporting(false);
                }
              }}
            />
          </FilterBar>

          {bgpError && <ErrorBanner message={bgpError} />}

          <DataTable
            columns={bgpColumns}
            rows={bgpResult.rows}
            rowKey={(r) => r.id}
            loading={bgpLoading}
            emptyTitle="Không có BGP peer"
            emptyDescription="Không có BGP neighbor nào khớp bộ lọc hiện tại."
            onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
            sort={bgpSort}
            onSortChange={setBgpSort}
            page={bgpPage}
            pageSize={PAGE_SIZE}
            totalCount={bgpResult.count}
            onPageChange={setBgpPage}
          />
        </div>
      )}

      {tab === "ospf" && (
        <div className="space-y-4">
          <FilterBar>
            <FilterMultiSelect label="Trạng thái" placeholder="Tất cả trạng thái" options={OSPF_STATE_ITEMS} selected={ospfState} onChange={setOspfState} countLabel="trạng thái đã chọn" />
            <FilterInput label="Tìm kiếm" value={ospfSearch} onChange={setOspfSearch} placeholder="Tìm thiết bị, neighbor IP, thiết bị neighbor..." />
            <ExportButton
              disabled={ospfResult.rows.length === 0}
              loading={ospfExporting}
              onClick={async () => {
                setOspfExporting(true);
                try {
                  const all = await fetchAllOspfNeighbors({
                    state: ospfState, search: debouncedOspfSearch,
                  });
                  await exportToExcel(
                    `ospf-neighbors-${todayStamp()}.xlsx`,
                    "OSPF Neighbors",
                    ROUTING_OSPF_NEIGHBOR_COLUMNS,
                    all,
                    "Báo cáo OSPF Neighbor",
                  );
                } catch (err: unknown) {
                  setOspfError((err as Error).message);
                } finally {
                  setOspfExporting(false);
                }
              }}
            />
          </FilterBar>

          {ospfError && <ErrorBanner message={ospfError} />}

          <DataTable
            columns={ospfColumns}
            rows={ospfResult.rows}
            rowKey={(r) => r.id}
            loading={ospfLoading}
            emptyTitle="Không có OSPF neighbor"
            emptyDescription="Không có OSPF neighbor nào khớp bộ lọc hiện tại."
            onRowClick={(r) => setSubject({ ipAddress: r.neighbor_ip, deviceName: r.device_name })}
            sort={ospfSort}
            onSortChange={setOspfSort}
            page={ospfPage}
            pageSize={PAGE_SIZE}
            totalCount={ospfResult.count}
            onPageChange={setOspfPage}
          />
        </div>
      )}

      <DetailDrawer subject={subject} onClose={() => setSubject(null)} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { AUDIT_CATEGORIES, fetchAuditFindings, fetchAllAuditFindings, fetchAuditFilterRows, type AuditFilterRow } from "../data/audit";
import { fetchDashboardSummary } from "../data/dashboard";
import type { AuditFinding, DashboardSummary, PagedResult, SortState } from "../types";
import { PageHeader } from "../components/PageHeader";
import { StatStrip } from "../components/StatStrip";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar, FilterInput, FilterMultiSelect, ExportButton } from "../components/FilterBar";
import { cascadingOptions } from "../lib/cascading-filters";
import { SeverityBadge } from "../components/SeverityBadge";
import { RuleLabel } from "../components/RuleLabel";
import { StatusBadge } from "../components/StatusBadge";
import { FindingDetail } from "../components/FindingDetail";
import { ErrorBanner } from "../components/ErrorBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { IpLink } from "../components/IpLink";
import type { DetailSubject } from "../data/detail";
import { exportToExcel, withDeltaLabel, AUDIT_COLUMNS } from "../lib/export";
import { batchDelta, formatNumber, todayStamp, valueOrDash } from "../lib/format";
import { useDebouncedValue } from "../lib/use-debounced-value";

const PAGE_SIZE = 25;

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low", "Info"];

export function IpAudit() {
  const [severity, setSeverity] = useState<string[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [rule, setRule] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [vrf, setVrf] = useState<string[]>([]);
  const [filterRows, setFilterRows] = useState<AuditFilterRow[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PagedResult<AuditFinding>>({ rows: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<DetailSubject | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAuditFilterRows()
      .then((rows) => {
        if (!cancelled) {
          setFilterRows(rows);
          const init = (pick: (r: AuditFilterRow) => string | null | undefined) =>
            [...new Set(rows.map(pick).filter((v): v is string => !!v))];
          setSeverity(init((r) => r.severity));
          setCategory(init((r) => r.category));
          setRule(init((r) => r.rule_code));
          setServiceType(init((r) => r.service_type));
          setStatus(init((r) => r.intf_status));
          setVrf(init((r) => r.vrf_instance));
          setFiltersReady(true);
        }
      })
      .catch(() => {
        /* If options can't load, filtersReady stays false so the table still
           shows all rows unfiltered (just with empty dropdowns) instead of
           getting stuck on an empty "[] = none selected" result. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Each filter's dropdown only offers values that can still produce a result
  // given the other filters' current selections — "linked"/cascading filters,
  // like Excel's column filters. See "Quy ước UI — Bộ lọc" in README.md.
  const filterSelections = { severity, category, rule_code: rule, service_type: serviceType, intf_status: status, vrf_instance: vrf };
  const severityValues = cascadingOptions(filterRows, filterSelections, "severity");
  const categoryValues = cascadingOptions(filterRows, filterSelections, "category");
  const ruleValues = cascadingOptions(filterRows, filterSelections, "rule_code");
  const serviceTypeValues = cascadingOptions(filterRows, filterSelections, "service_type");
  const statusValues = cascadingOptions(filterRows, filterSelections, "intf_status");
  const vrfValues = cascadingOptions(filterRows, filterSelections, "vrf_instance");

  const orderedSeverityValues = SEVERITY_ORDER.filter((v) => severityValues.includes(v));
  const orderedCategoryValues = AUDIT_CATEGORIES.filter((v) => categoryValues.includes(v));

  useEffect(() => {
    setPage(0);
  }, [severity, category, rule, serviceType, status, vrf, debouncedSearch, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Until the filter options have loaded, the multi-selects are still empty
    // ([] = "none selected" to the data layer). Send `undefined` ("no filter")
    // for that window so the first load shows all rows instead of an empty
    // flash, and a failed options load still renders data (just no dropdowns).
    const f = (v: string[]) => (filtersReady ? v : undefined);
    fetchAuditFindings({
      severity: f(severity),
      category: f(category),
      rule: f(rule),
      serviceType: f(serviceType),
      status: f(status),
      vrf: f(vrf),
      search: debouncedSearch,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
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
  }, [severity, category, rule, serviceType, status, vrf, debouncedSearch, sort, page, filtersReady]);

  const columns: Column<AuditFinding>[] = [
    {
      key: "is_new",
      header: "Δ",
      render: (r) => r.is_new
        ? <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">Mới</span>
        : <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">Không đổi</span>,
      sortable: true,
    },
    { key: "severity", header: "Mức độ", render: (r) => <SeverityBadge severity={r.severity} />, sortable: true },
    { key: "category", header: "Nhóm", render: (r) => r.category, sortable: true },
    { key: "rule_code", header: "Rule", render: (r) => <RuleLabel code={r.rule_code} />, sortable: true },
    { key: "title", header: "Tiêu đề", render: (r) => r.title, className: "max-w-md", sortable: true },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "ip_address", header: "IP / Network", render: (r) => <IpLink value={r.ip_address ?? r.network} />, sortable: true },
    { key: "interface_name", header: "Interface", render: (r) => valueOrDash(r.interface_name), sortable: true },
    {
      key: "detail",
      header: "Chi tiết",
      render: (r) => <FindingDetail detail={r.detail} />,
      className: "max-w-md",
      sortable: true,
    },
    { key: "status", header: "Xử lý", render: (r) => <StatusBadge value={r.status} />, sortable: true },
    { key: "priority_score", header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortable: true },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kiểm tra IP"
        description="IP trùng, network bị dùng quá mức, sai lệch gateway/prefix và mâu thuẫn trạng thái, sắp xếp theo độ ưu tiên."
      />

      {summary && (() => {
        const hasPrev = summary.prev_batch_id != null;
        const dd = (curr: number | null | undefined, prev: number | null | undefined) => batchDelta(hasPrev, curr, prev);
        return (
          <StatStrip
            title="Phát hiện kiểm tra"
            items={[
              { label: "Critical", value: formatNumber(summary.findings_critical), tone: "critical", delta: dd(summary.findings_critical, summary.prev_findings_critical), deltaInverted: true },
              { label: "High", value: formatNumber(summary.findings_high), tone: "high", delta: dd(summary.findings_high, summary.prev_findings_high), deltaInverted: true },
              { label: "Medium", value: formatNumber(summary.findings_medium), tone: "medium", delta: dd(summary.findings_medium, summary.prev_findings_medium), deltaInverted: true },
              { label: "Low", value: formatNumber(summary.findings_low), tone: "low", delta: dd(summary.findings_low, summary.prev_findings_low), deltaInverted: true },
              { label: "Info", value: formatNumber(summary.findings_info), tone: "info", delta: dd(summary.findings_info, summary.prev_findings_info), deltaInverted: true },
              { label: "Tổng", value: formatNumber(summary.findings_total), delta: dd(summary.findings_total, summary.prev_findings_total), deltaInverted: true },
              { label: "Mới phát sinh", value: formatNumber(summary.findings_new ?? 0), tone: "high" },
              { label: "Đã xử lý", value: formatNumber(summary.findings_resolved ?? 0), tone: "ok" },
            ]}
          />
        );
      })()}

      <FilterBar>
        <FilterMultiSelect label="Mức độ" placeholder="Tất cả mức độ" options={orderedSeverityValues} selected={severity} onChange={setSeverity} countLabel="mức độ đã chọn" />
        <FilterMultiSelect label="Nhóm" placeholder="Tất cả nhóm" options={orderedCategoryValues} selected={category} onChange={setCategory} countLabel="nhóm đã chọn" />
        <FilterMultiSelect label="Rule" placeholder="Tất cả rule" options={ruleValues} selected={rule} onChange={setRule} countLabel="rule đã chọn" />
        <FilterMultiSelect label="Dịch vụ" placeholder="Tất cả dịch vụ" options={serviceTypeValues} selected={serviceType} onChange={setServiceType} countLabel="dịch vụ đã chọn" />
        <FilterMultiSelect label="Trạng thái" placeholder="Tất cả trạng thái" options={statusValues} selected={status} onChange={setStatus} countLabel="trạng thái đã chọn" />
        <FilterMultiSelect label="VRF" placeholder="Tất cả VRF" options={vrfValues} selected={vrf} onChange={setVrf} countLabel="VRF đã chọn" />
        <FilterInput label="Tìm kiếm" value={search} onChange={setSearch} placeholder="Tìm thiết bị, tiêu đề, rule, interface..." />
        <ExportButton
          disabled={result.rows.length === 0}
          loading={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const f = (v: string[]) => (filtersReady ? v : undefined);
              const raw = await fetchAllAuditFindings({
                severity: f(severity), category: f(category), rule: f(rule),
                serviceType: f(serviceType), status: f(status), vrf: f(vrf),
                search: debouncedSearch,
              });
              const all = withDeltaLabel(raw);
              await exportToExcel(
                `audit-findings-${todayStamp()}.xlsx`,
                "Audit Findings",
                AUDIT_COLUMNS,
                all,
                "Báo cáo kiểm tra IP",
              );
            } catch (err: unknown) {
              setError((err as Error).message);
            } finally {
              setExporting(false);
            }
          }}
        />
      </FilterBar>

      {error && <ErrorBanner message={error} />}

      <DataTable
        columns={columns}
        rows={result.rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyTitle="Không có phát hiện"
        emptyDescription="Không có phát hiện nào khớp bộ lọc hiện tại."
        onRowClick={(r) => setSubject({ ipAddress: r.ip_address, deviceName: r.device_name })}
        sort={sort}
        onSortChange={setSort}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={result.count}
        onPageChange={setPage}
      />

      <p className="text-sm text-slate-400">Export tải xuống toàn bộ dữ liệu khớp bộ lọc hiện tại.</p>

      <DetailDrawer subject={subject} onClose={() => setSubject(null)} />
    </div>
  );
}

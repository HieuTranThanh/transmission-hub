import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "../data/dashboard";
import {
  fetchHwAlarmSummary,
  fetchAllHwAlarmSummary,
  fetchHwAlarmSummaryFilterRows,
  fetchHwAlarmDetails,
  fetchAllHwAlarmDetails,
  fetchHwAlarmDetailFilterRows,
  fetchHwAlarmErrors,
  type HwAlarmSummaryFilterRow,
  type HwAlarmDetailFilterRow,
} from "../data/hw-alarm";
import type { DashboardSummary, HwAlarmSummary, HwAlarmDetail, HwAlarmError, PagedResult, SortState } from "../types";
import { PageHeader } from "../components/PageHeader";
import { StatStrip } from "../components/StatStrip";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar, FilterInput, FilterMultiSelect, ExportButton } from "../components/FilterBar";
import { cascadingOptions } from "../lib/cascading-filters";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorBanner } from "../components/ErrorBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { IpLink } from "../components/IpLink";
import type { DetailSubject } from "../data/detail";
import { exportToExcel, withDeltaLabel, HW_ALARM_SUMMARY_COLUMNS, HW_ALARM_DETAIL_COLUMNS } from "../lib/export";
import { batchDelta, formatNumber, todayStamp, valueOrDash } from "../lib/format";
import { useDebouncedValue } from "../lib/use-debounced-value";

const PAGE_SIZE = 25;

const OK_STATUSES = new Set(["ok", "up", "normal", "off", "not asserted", "alarm cleared", "n/a", ""]);
function isAlarmRow(row: HwAlarmDetail): boolean {
  if (row.severity) return true;
  const s = (row.status ?? "").toLowerCase();
  return !OK_STATUSES.has(s);
}

type Tab = "summary" | "details" | "errors";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Tổng hợp thiết bị" },
  { id: "details", label: "Chi tiết cảnh báo" },
  { id: "errors", label: "Lỗi thu thập" },
];

export function HwAlarm() {
  const [dashSummary, setDashSummary] = useState<DashboardSummary | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [subject, setSubject] = useState<DetailSubject | null>(null);

  // --- Summary tab state ---
  const [sumVendor, setSumVendor] = useState<string[]>([]);
  const [sumOverallStatus, setSumOverallStatus] = useState<string[]>([]);
  const [sumFilterRows, setSumFilterRows] = useState<HwAlarmSummaryFilterRow[]>([]);
  const [sumFiltersReady, setSumFiltersReady] = useState(false);
  const [sumSearch, setSumSearch] = useState("");
  const debouncedSumSearch = useDebouncedValue(sumSearch);
  const [sumSort, setSumSort] = useState<SortState | null>(null);
  const [sumPage, setSumPage] = useState(0);
  const [sumResult, setSumResult] = useState<PagedResult<HwAlarmSummary>>({ rows: [], count: 0 });
  const [sumLoading, setSumLoading] = useState(true);
  const [sumError, setSumError] = useState<string | null>(null);
  const [sumExporting, setSumExporting] = useState(false);

  // --- Details tab state ---
  const [detVendor, setDetVendor] = useState<string[]>([]);
  const [detCategory, setDetCategory] = useState<string[]>([]);
  const [detStatus, setDetStatus] = useState<string[]>([]);
  const [detFilterRows, setDetFilterRows] = useState<HwAlarmDetailFilterRow[]>([]);
  const [detFiltersReady, setDetFiltersReady] = useState(false);
  const [detSearch, setDetSearch] = useState("");
  const debouncedDetSearch = useDebouncedValue(detSearch);
  const [detSort, setDetSort] = useState<SortState | null>(null);
  const [detPage, setDetPage] = useState(0);
  const [detResult, setDetResult] = useState<PagedResult<HwAlarmDetail>>({ rows: [], count: 0 });
  const [detLoading, setDetLoading] = useState(true);
  const [detError, setDetError] = useState<string | null>(null);
  const [detExporting, setDetExporting] = useState(false);

  // --- Errors tab state ---
  const [errRows, setErrRows] = useState<HwAlarmError[]>([]);
  const [errLoading, setErrLoading] = useState(true);
  const [errError, setErrError] = useState<string | null>(null);

  // Dashboard summary for stat strip
  useEffect(() => {
    fetchDashboardSummary().then(setDashSummary).catch(() => setDashSummary(null));
  }, []);

  // --- Summary filter init ---
  useEffect(() => {
    let cancelled = false;
    fetchHwAlarmSummaryFilterRows()
      .then((rows) => {
        if (cancelled) return;
        setSumFilterRows(rows);
        const init = (pick: (r: HwAlarmSummaryFilterRow) => string | null | undefined) =>
          [...new Set(rows.map(pick).filter((v): v is string => !!v))];
        setSumVendor(init((r) => r.vendor));
        setSumOverallStatus(init((r) => r.overall_status));
        setSumFiltersReady(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // --- Details filter init ---
  useEffect(() => {
    let cancelled = false;
    fetchHwAlarmDetailFilterRows()
      .then((rows) => {
        if (cancelled) return;
        setDetFilterRows(rows);
        const init = (pick: (r: HwAlarmDetailFilterRow) => string | null | undefined) =>
          [...new Set(rows.map(pick).filter((v): v is string => !!v))];
        setDetVendor(init((r) => r.vendor));
        setDetCategory(init((r) => r.category));
        setDetStatus(init((r) => r.status));
        setDetFiltersReady(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // --- Cascading options ---
  const sumSelections = { vendor: sumVendor, overall_status: sumOverallStatus };
  const sumVendorValues = cascadingOptions(sumFilterRows, sumSelections, "vendor");
  const sumOverallStatusValues = cascadingOptions(sumFilterRows, sumSelections, "overall_status");

  const detSelections = { vendor: detVendor, category: detCategory, status: detStatus };
  const detVendorValues = cascadingOptions(detFilterRows, detSelections, "vendor");
  const detCategoryValues = cascadingOptions(detFilterRows, detSelections, "category");
  const detStatusValues = cascadingOptions(detFilterRows, detSelections, "status");

  // --- Summary data fetch ---
  useEffect(() => { setSumPage(0); }, [sumVendor, sumOverallStatus, debouncedSumSearch, sumSort]);

  useEffect(() => {
    if (tab !== "summary") return;
    let cancelled = false;
    setSumLoading(true);
    const f = (v: string[]) => (sumFiltersReady ? v : undefined);
    fetchHwAlarmSummary({
      vendor: f(sumVendor),
      overallStatus: f(sumOverallStatus),
      search: debouncedSumSearch,
      sort: sumSort,
      page: sumPage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => { if (!cancelled) { setSumResult(res); setSumError(null); } })
      .catch((err: Error) => { if (!cancelled) setSumError(err.message); })
      .finally(() => { if (!cancelled) setSumLoading(false); });
    return () => { cancelled = true; };
  }, [tab, sumVendor, sumOverallStatus, debouncedSumSearch, sumSort, sumPage, sumFiltersReady]);

  // --- Details data fetch ---
  useEffect(() => { setDetPage(0); }, [detVendor, detCategory, detStatus, debouncedDetSearch, detSort]);

  useEffect(() => {
    if (tab !== "details") return;
    let cancelled = false;
    setDetLoading(true);
    const f = (v: string[]) => (detFiltersReady ? v : undefined);
    fetchHwAlarmDetails({
      vendor: f(detVendor),
      category: f(detCategory),
      status: f(detStatus),
      search: debouncedDetSearch,
      sort: detSort,
      page: detPage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => { if (!cancelled) { setDetResult(res); setDetError(null); } })
      .catch((err: Error) => { if (!cancelled) setDetError(err.message); })
      .finally(() => { if (!cancelled) setDetLoading(false); });
    return () => { cancelled = true; };
  }, [tab, detVendor, detCategory, detStatus, debouncedDetSearch, detSort, detPage, detFiltersReady]);

  // --- Errors data fetch ---
  useEffect(() => {
    if (tab !== "errors") return;
    let cancelled = false;
    setErrLoading(true);
    fetchHwAlarmErrors()
      .then((rows) => { if (!cancelled) { setErrRows(rows); setErrError(null); } })
      .catch((err: Error) => { if (!cancelled) setErrError(err.message); })
      .finally(() => { if (!cancelled) setErrLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);

  // --- Column definitions ---
  const summaryColumns: Column<HwAlarmSummary>[] = [
    {
      key: "is_new", header: "Δ",
      render: (r) => r.is_new
        ? <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">Mới</span>
        : <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">Không đổi</span>,
      sortable: true,
    },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "device_ip", header: "Device IP", render: (r) => <IpLink value={r.device_ip} />, sortable: true },
    { key: "vendor", header: "Vendor", render: (r) => valueOrDash(r.vendor), sortable: true },
    {
      key: "overall_status", header: "Tổng thể",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge value={r.overall_status} />
          {r.prev_overall_status && r.prev_overall_status !== r.overall_status && (
            <span className="text-sm text-slate-400">← {r.prev_overall_status}</span>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      key: "critical", header: "Critical",
      render: (r) => {
        const delta = r.prev_critical != null ? r.critical - r.prev_critical : null;
        return (
          <span>
            <span className={r.critical > 0 ? "font-semibold text-red-600" : ""}>{formatNumber(r.critical)}</span>
            {delta != null && delta !== 0 && (
              <span className={`ml-1 text-sm ${delta > 0 ? "text-red-500" : "text-emerald-500"}`}>
                {delta > 0 ? "↑" : "↓"}{Math.abs(delta)}
              </span>
            )}
          </span>
        );
      },
      sortable: true,
    },
    {
      key: "major", header: "Major",
      render: (r) => {
        const delta = r.prev_major != null ? r.major - r.prev_major : null;
        return (
          <span>
            <span className={r.major > 0 ? "font-medium text-amber-600" : ""}>{formatNumber(r.major)}</span>
            {delta != null && delta !== 0 && (
              <span className={`ml-1 text-sm ${delta > 0 ? "text-red-500" : "text-emerald-500"}`}>
                {delta > 0 ? "↑" : "↓"}{Math.abs(delta)}
              </span>
            )}
          </span>
        );
      },
      sortable: true,
    },
    { key: "minor", header: "Minor", render: (r) => formatNumber(r.minor), sortable: true },
    { key: "power_status", header: "Power", render: (r) => valueOrDash(r.power_status), className: "max-w-[12rem]", sortable: true },
    { key: "fan_status", header: "Fan", render: (r) => valueOrDash(r.fan_status), className: "max-w-[12rem]", sortable: true },
    { key: "max_temp", header: "Nhiệt độ max", render: (r) => valueOrDash(r.max_temp), sortable: true },
    { key: "temp_threshold", header: "Ngưỡng nhiệt", render: (r) => valueOrDash(r.temp_threshold), sortable: true },
  ];

  const detailColumns: Column<HwAlarmDetail>[] = [
    {
      key: "is_new", header: "Δ",
      render: (r) => r.is_new
        ? <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">Mới</span>
        : <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">Không đổi</span>,
      sortable: true,
    },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "device_ip", header: "Device IP", render: (r) => <IpLink value={r.device_ip} />, sortable: true },
    { key: "vendor", header: "Vendor", render: (r) => valueOrDash(r.vendor), sortable: true },
    {
      key: "category", header: "Nhóm",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span>{valueOrDash(r.category)}</span>
          {r.severity && <StatusBadge value={r.severity} />}
          {r.prev_severity && r.prev_severity !== r.severity && (
            <span className="text-sm text-slate-400">← {r.prev_severity}</span>
          )}
        </div>
      ),
      sortable: true,
    },
    { key: "component", header: "Thành phần", render: (r) => valueOrDash(r.component), className: "max-w-xs", sortable: true },
    {
      key: "status", header: "Trạng thái",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge value={r.status} />
          {r.prev_status && r.prev_status !== r.status && (
            <span className="text-sm text-slate-400">← {r.prev_status}</span>
          )}
        </div>
      ),
      sortable: true,
    },
    { key: "detail", header: "Chi tiết", render: (r) => valueOrDash(r.detail), className: "max-w-md", sortable: true },
  ];

  const errorColumns: Column<HwAlarmError>[] = [
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true, sortAccessor: (r) => r.device_name },
    { key: "device_ip", header: "Device IP", render: (r) => <IpLink value={r.device_ip} />, sortable: true, sortAccessor: (r) => r.device_ip },
    { key: "vendor", header: "Vendor", render: (r) => valueOrDash(r.vendor), sortable: true, sortAccessor: (r) => r.vendor },
    { key: "error", header: "Lỗi", render: (r) => valueOrDash(r.error), className: "max-w-lg", sortable: true, sortAccessor: (r) => r.error },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Cảnh báo phần cứng" description="Thống kê alarm, nhiệt độ, nguồn, quạt từ thiết bị truyền dẫn (Nokia/Cisco/Juniper)." />

      {dashSummary && (() => {
        const hasPrev = dashSummary.prev_batch_id != null;
        const d = (curr: number | null | undefined, prev: number | null | undefined) => batchDelta(hasPrev, curr, prev);
        return (
          <StatStrip
            title="Cảnh báo phần cứng"
            items={[
              { label: "Thiết bị kiểm tra", value: formatNumber(dashSummary.hw_alarm_total_devices), delta: d(dashSummary.hw_alarm_total_devices, dashSummary.prev_hw_alarm_total_devices) },
              { label: "Critical", value: formatNumber(dashSummary.hw_alarm_critical), tone: "critical", delta: d(dashSummary.hw_alarm_critical, dashSummary.prev_hw_alarm_critical), deltaInverted: true },
              { label: "Warning", value: formatNumber(dashSummary.hw_alarm_warning), tone: "medium", delta: d(dashSummary.hw_alarm_warning, dashSummary.prev_hw_alarm_warning), deltaInverted: true },
              { label: "OK", value: formatNumber(dashSummary.hw_alarm_ok), tone: "ok", delta: d(dashSummary.hw_alarm_ok, dashSummary.prev_hw_alarm_ok) },
              { label: "Alarm Critical", value: formatNumber(dashSummary.hw_alarm_detail_critical), tone: "critical", delta: d(dashSummary.hw_alarm_detail_critical, dashSummary.prev_hw_alarm_detail_critical), deltaInverted: true },
              { label: "Alarm Major", value: formatNumber(dashSummary.hw_alarm_detail_major), tone: "high", delta: d(dashSummary.hw_alarm_detail_major, dashSummary.prev_hw_alarm_detail_major), deltaInverted: true },
              { label: "Alarm Minor", value: formatNumber(dashSummary.hw_alarm_detail_minor), tone: "low", delta: d(dashSummary.hw_alarm_detail_minor, dashSummary.prev_hw_alarm_detail_minor), deltaInverted: true },
              { label: "Lỗi thu thập", value: formatNumber(dashSummary.hw_alarm_collection_errors), tone: "critical", delta: d(dashSummary.hw_alarm_collection_errors, dashSummary.prev_hw_alarm_collection_errors), deltaInverted: true },
            ]}
          />
        );
      })()}

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

      {/* ---- Summary tab ---- */}
      {tab === "summary" && (
        <div className="space-y-4">
          <FilterBar>
            <FilterMultiSelect label="Vendor" placeholder="Tất cả vendor" options={sumVendorValues} selected={sumVendor} onChange={setSumVendor} countLabel="vendor đã chọn" />
            <FilterMultiSelect label="Tổng thể" placeholder="Tất cả trạng thái" options={sumOverallStatusValues} selected={sumOverallStatus} onChange={setSumOverallStatus} countLabel="trạng thái đã chọn" />
            <FilterInput label="Tìm kiếm" value={sumSearch} onChange={setSumSearch} placeholder="Tìm thiết bị, IP..." />
            <ExportButton
              disabled={sumResult.rows.length === 0}
              loading={sumExporting}
              onClick={async () => {
                setSumExporting(true);
                try {
                  const f = (v: string[]) => (sumFiltersReady ? v : undefined);
                  const raw = await fetchAllHwAlarmSummary({
                    vendor: f(sumVendor), overallStatus: f(sumOverallStatus), search: debouncedSumSearch,
                  });
                  const all = withDeltaLabel(raw);
                  await exportToExcel(
                    `hw-alarm-summary-${todayStamp()}.xlsx`, "Alarm Summary",
                    HW_ALARM_SUMMARY_COLUMNS, all, "Báo cáo tổng hợp cảnh báo phần cứng",
                  );
                } catch (err: unknown) { setSumError((err as Error).message); }
                finally { setSumExporting(false); }
              }}
            />
          </FilterBar>

          {sumError && <ErrorBanner message={sumError} />}

          <DataTable
            columns={summaryColumns}
            rows={sumResult.rows}
            rowKey={(r) => r.id}
            loading={sumLoading}
            emptyTitle="Không có dữ liệu cảnh báo"
            emptyDescription="Chưa có dữ liệu hw_alarm hoặc không khớp bộ lọc hiện tại."
            onRowClick={(r) => { setDetSearch(r.device_name ?? ""); setTab("details"); }}
            sort={sumSort}
            onSortChange={setSumSort}
            page={sumPage}
            pageSize={PAGE_SIZE}
            totalCount={sumResult.count}
            onPageChange={setSumPage}
          />
        </div>
      )}

      {/* ---- Details tab ---- */}
      {tab === "details" && (
        <div className="space-y-4">
          <FilterBar>
            <FilterMultiSelect label="Vendor" placeholder="Tất cả vendor" options={detVendorValues} selected={detVendor} onChange={setDetVendor} countLabel="vendor đã chọn" />
            <FilterMultiSelect label="Nhóm" placeholder="Tất cả nhóm" options={detCategoryValues} selected={detCategory} onChange={setDetCategory} countLabel="nhóm đã chọn" />
            <FilterMultiSelect label="Trạng thái" placeholder="Tất cả trạng thái" options={detStatusValues} selected={detStatus} onChange={setDetStatus} countLabel="trạng thái đã chọn" />
            <FilterInput label="Tìm kiếm" value={detSearch} onChange={setDetSearch} placeholder="Tìm thiết bị, thành phần, chi tiết..." />
            <ExportButton
              disabled={detResult.rows.length === 0}
              loading={detExporting}
              onClick={async () => {
                setDetExporting(true);
                try {
                  const f = (v: string[]) => (detFiltersReady ? v : undefined);
                  const raw = await fetchAllHwAlarmDetails({
                    vendor: f(detVendor), category: f(detCategory),
                    status: f(detStatus), search: debouncedDetSearch,
                  });
                  const all = withDeltaLabel(raw);
                  await exportToExcel(
                    `hw-alarm-details-${todayStamp()}.xlsx`, "Alarm Details",
                    HW_ALARM_DETAIL_COLUMNS, all, "Báo cáo chi tiết cảnh báo phần cứng",
                  );
                } catch (err: unknown) { setDetError((err as Error).message); }
                finally { setDetExporting(false); }
              }}
            />
          </FilterBar>

          {detError && <ErrorBanner message={detError} />}

          <DataTable
            columns={detailColumns}
            rows={detResult.rows}
            rowKey={(r) => r.id}
            loading={detLoading}
            emptyTitle="Không có chi tiết cảnh báo"
            emptyDescription="Chưa có dữ liệu hw_alarm detail hoặc không khớp bộ lọc hiện tại."
            onRowClick={(r) => setSubject({ ipAddress: r.device_ip, deviceName: r.device_name })}
            rowClassName={(r) => isAlarmRow(r) ? "bg-red-50" : ""}
            sort={detSort}
            onSortChange={setDetSort}
            page={detPage}
            pageSize={PAGE_SIZE}
            totalCount={detResult.count}
            onPageChange={setDetPage}
          />
        </div>
      )}

      {/* ---- Errors tab ---- */}
      {tab === "errors" && (
        <div className="space-y-4">
          {errError && <ErrorBanner message={errError} />}

          <DataTable
            columns={errorColumns}
            rows={errRows}
            rowKey={(r) => r.id}
            loading={errLoading}
            emptyTitle="Không có lỗi thu thập"
            emptyDescription="Tất cả thiết bị đã thu thập thành công."
          />
        </div>
      )}

      <DetailDrawer subject={subject} onClose={() => setSubject(null)} />
    </div>
  );
}

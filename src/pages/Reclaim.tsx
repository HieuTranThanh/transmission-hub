import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "../data/dashboard";
import { fetchResourceCandidates, fetchAllResourceCandidates, fetchReclaimFilterRows, splitReasonFactors, type ReclaimFilterRow } from "../data/reclaim";
import type { DashboardSummary, PagedResult, ResourceCandidate, SortState } from "../types";
import { PageHeader } from "../components/PageHeader";
import { StatStrip } from "../components/StatStrip";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar, FilterInput, FilterMultiSelect, ExportButton } from "../components/FilterBar";
import { cascadingOptions } from "../lib/cascading-filters";
import { StatusBadge } from "../components/StatusBadge";
import { ReasonList } from "../components/ReasonList";
import { ErrorBanner } from "../components/ErrorBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { IpLink } from "../components/IpLink";
import type { DetailSubject } from "../data/detail";
import { exportToExcel, withDeltaLabel, RECLAIM_COLUMNS } from "../lib/export";
import { batchDelta, formatNumber, todayStamp, valueOrDash } from "../lib/format";
import { useDebouncedValue } from "../lib/use-debounced-value";

const PAGE_SIZE = 25;

const CONFIDENCE_ORDER = ["High", "Medium", "Low"];

export function Reclaim() {
  const [confidence, setConfidence] = useState<string[]>([]);
  const [candidateType, setCandidateType] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState<string[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [filterRows, setFilterRows] = useState<ReclaimFilterRow[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PagedResult<ResourceCandidate>>({ rows: [], count: 0 });
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
    fetchReclaimFilterRows()
      .then((rows) => {
        if (!cancelled) {
          setFilterRows(rows);
          const init = (pick: (r: ReclaimFilterRow) => string | null | undefined) =>
            [...new Set(rows.map(pick).filter((v): v is string => !!v))];
          setConfidence(init((r) => r.confidence));
          setCandidateType(init((r) => r.candidate_type));
          setServiceType(init((r) => r.service_type));
          const allReasons = new Set<string>();
          for (const row of rows) {
            for (const factor of splitReasonFactors(row.reason)) allReasons.add(factor);
          }
          setSelectedReasons(Array.from(allReasons).sort((a, b) => a.localeCompare(b, "vi")));
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
  // "Lý do" uses OR/substring matching, so it's applied to the dataset first;
  // the three equality filters then cascade against each other and against it.
  const allReasonFactors = (() => {
    const set = new Set<string>();
    for (const row of filterRows) {
      for (const factor of splitReasonFactors(row.reason)) set.add(factor);
    }
    return set;
  })();
  const allReasonsActive =
    selectedReasons.length === 0 ||
    (allReasonFactors.size > 0 && [...allReasonFactors].every((r) => selectedReasons.includes(r)));
  // "Every factor selected" specifically (not the zero-selected case) means the
  // reason filter is a no-op, so the fetch sends `undefined` instead of a long
  // `reason.ilike` OR over every factor — matching how the other filters treat
  // "all selected = no filter". Zero-selected still sends `[]` (→ no rows).
  const allReasonFactorsSelected = allReasonsActive && selectedReasons.length > 0;

  const rowsMatchingReasons = filterRows.filter(
    (row) => allReasonsActive || selectedReasons.some((r) => row.reason?.includes(r))
  );
  const categoricalSelections = { confidence, candidate_type: candidateType, service_type: serviceType };
  const confidenceValues = cascadingOptions(rowsMatchingReasons, categoricalSelections, "confidence");
  const candidateTypeValues = cascadingOptions(rowsMatchingReasons, categoricalSelections, "candidate_type");
  const serviceTypeValues = cascadingOptions(rowsMatchingReasons, categoricalSelections, "service_type");

  const confSet = new Set(confidence);
  const typeSet = new Set(candidateType);
  const svcSet = new Set(serviceType);
  const confAll = confSet.size === 0 || !filterRows.some((r) => r.confidence && !confSet.has(r.confidence));
  const typeAll = typeSet.size === 0 || !filterRows.some((r) => r.candidate_type && !typeSet.has(r.candidate_type));
  const svcAll = svcSet.size === 0 || !filterRows.some((r) => r.service_type != null && r.service_type !== "" && !svcSet.has(r.service_type));

  const rowsMatchingCategorical = filterRows.filter(
    (row) =>
      (confAll || confSet.has(row.confidence)) &&
      (typeAll || typeSet.has(row.candidate_type)) &&
      (svcAll || (row.service_type == null ? true : svcSet.has(row.service_type)))
  );
  const reasonOptions = (() => {
    const set = new Set<string>();
    for (const row of rowsMatchingCategorical) {
      for (const factor of splitReasonFactors(row.reason)) set.add(factor);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  })();

  const orderedConfidenceValues = CONFIDENCE_ORDER.filter((v) => confidenceValues.includes(v));

  useEffect(() => {
    setPage(0);
  }, [confidence, candidateType, serviceType, selectedReasons, debouncedSearch, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Until the filter options have loaded, the multi-selects are still empty
    // ([] = "none selected" to the data layer). Send `undefined` ("no filter")
    // for that window so the first load shows all rows instead of an empty
    // flash, and a failed options load still renders data (just no dropdowns).
    const f = (v: string[]) => (filtersReady ? v : undefined);
    fetchResourceCandidates({
      confidence: f(confidence),
      candidateType: f(candidateType),
      serviceType: f(serviceType),
      reasons: filtersReady && !allReasonFactorsSelected ? selectedReasons : undefined,
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
  }, [confidence, candidateType, serviceType, selectedReasons, debouncedSearch, sort, page, filtersReady]);

  const columns: Column<ResourceCandidate>[] = [
    {
      key: "is_new",
      header: "Δ",
      render: (r) => r.is_new
        ? <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">Mới</span>
        : <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">Không đổi</span>,
      sortable: true,
    },
    { key: "confidence", header: "Độ tin cậy", render: (r) => <StatusBadge value={r.confidence} />, sortable: true },
    { key: "candidate_type", header: "Loại", render: (r) => r.candidate_type, sortable: true },
    { key: "device_name", header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortable: true },
    { key: "ip_address", header: "IP / Network", render: (r) => <IpLink value={r.ip_address ?? r.network} />, sortable: true },
    { key: "interface_name", header: "Interface", render: (r) => valueOrDash(r.interface_name), sortable: true },
    { key: "service_type", header: "Dịch vụ", render: (r) => valueOrDash(r.service_type), sortable: true },
    { key: "current_status", header: "Trạng thái hiện tại", render: (r) => <StatusBadge value={r.current_status} />, sortable: true },
    { key: "score", header: "Điểm", render: (r) => formatNumber(r.score), sortable: true },
    { key: "priority_score", header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortable: true },
    { key: "reason", header: "Lý do", render: (r) => <ReasonList reason={r.reason} />, className: "max-w-md", sortable: true },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Thu hồi tài nguyên"
        description="Các thiết bị/interface có vẻ không dùng hoặc đang down — sắp xếp theo điểm ưu tiên thu hồi."
      />

      {summary && (() => {
        const hasPrev = summary.prev_batch_id != null;
        const dd = (curr: number | null | undefined, prev: number | null | undefined) => batchDelta(hasPrev, curr, prev);
        return (
          <StatStrip
            items={[
              { label: "Tổng ứng viên", value: formatNumber(summary.reclaim_total), delta: dd(summary.reclaim_total, summary.prev_reclaim_total) },
              { label: "Độ tin cậy High", value: formatNumber(summary.reclaim_high), tone: "ok", delta: dd(summary.reclaim_high, summary.prev_reclaim_high) },
              { label: "Độ tin cậy Medium", value: formatNumber(summary.reclaim_medium), tone: "medium", delta: dd(summary.reclaim_medium, summary.prev_reclaim_medium) },
              { label: "Độ tin cậy Low", value: formatNumber(summary.reclaim_low), tone: "low", delta: dd(summary.reclaim_low, summary.prev_reclaim_low) },
            ]}
          />
        );
      })()}

      <FilterBar>
        <div className="flex w-full flex-wrap items-end gap-x-3 gap-y-3">
          <FilterMultiSelect
            label="Loại"
            placeholder="Tất cả loại"
            options={candidateTypeValues}
            selected={candidateType}
            onChange={setCandidateType}
            countLabel="loại đã chọn"
          />
          <FilterMultiSelect
            label="Dịch vụ"
            placeholder="Tất cả dịch vụ"
            options={serviceTypeValues}
            selected={serviceType}
            onChange={setServiceType}
            countLabel="dịch vụ đã chọn"
          />
          <FilterMultiSelect
            label="Độ tin cậy"
            placeholder="Tất cả độ tin cậy"
            options={orderedConfidenceValues}
            selected={confidence}
            onChange={setConfidence}
            countLabel="mức đã chọn"
          />
        </div>
        <div className="flex w-full flex-col items-end gap-3 sm:flex-row">
          <div className="w-full sm:w-1/2">
            <FilterMultiSelect
              label="Lý do"
              placeholder="Tất cả lý do"
              options={reasonOptions}
              selected={selectedReasons}
              onChange={setSelectedReasons}
              countLabel="lý do đã chọn"
            />
          </div>
          <div className="flex w-full items-end gap-x-3 sm:w-1/2">
            <FilterInput label="Tìm kiếm" value={search} onChange={setSearch} placeholder="Tìm thiết bị, interface, lý do, loại thu hồi..." />
            <ExportButton
              disabled={result.rows.length === 0}
              loading={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const f = (v: string[]) => (filtersReady ? v : undefined);
                  const raw = await fetchAllResourceCandidates({
                    confidence: f(confidence), candidateType: f(candidateType),
                    serviceType: f(serviceType),
                    reasons: filtersReady && !allReasonFactorsSelected ? selectedReasons : undefined,
                    search: debouncedSearch,
                  });
                  const all = withDeltaLabel(raw);
                  await exportToExcel(
                    `resource-reclaim-${todayStamp()}.xlsx`,
                    "Reclaim Candidates",
                    RECLAIM_COLUMNS,
                    all,
                    "Báo cáo thu hồi tài nguyên",
                  );
                } catch (err: unknown) {
                  setError((err as Error).message);
                } finally {
                  setExporting(false);
                }
              }}
            />
          </div>
        </div>
      </FilterBar>

      {error && <ErrorBanner message={error} />}

      <DataTable
        columns={columns}
        rows={result.rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyTitle="Không có ứng viên thu hồi"
        emptyDescription="Không có ứng viên nào khớp bộ lọc hiện tại."
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

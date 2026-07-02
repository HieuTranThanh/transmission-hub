import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  fetchSubjectDetail,
  EMPTY_SUBJECT_DETAIL,
  type DetailSubject,
  type SubjectDetail,
} from "../data/detail";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { SeverityBadge } from "./SeverityBadge";
import { RuleLabel } from "./RuleLabel";
import { StatusBadge } from "./StatusBadge";
import { ReasonList } from "./ReasonList";
import { compareValues, nextSortState, SortIcon, type SortState } from "./DataTable";
import { valueOrDash, formatNumber } from "../lib/format";

interface DetailDrawerProps {
  subject: DetailSubject | null;
  onClose: () => void;
}

interface MiniColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  sortAccessor?: (row: T) => string | number | null | undefined;
}

function MiniTable<T>({ rows, columns, rowKey }: { rows: T[]; columns: MiniColumn<T>[]; rowKey: (row: T) => string }) {
  const [sort, setSort] = useState<SortState | null>(null);

  let displayRows = rows;
  if (sort) {
    const col = columns.find((c) => c.header === sort.key);
    if (col?.sortAccessor) {
      const accessor = col.sortAccessor;
      const factor = sort.dir === "asc" ? 1 : -1;
      displayRows = [...rows].sort((a, b) => factor * compareValues(accessor(a), accessor(b)));
    }
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200/80 bg-slate-50/80 text-sm text-slate-500">
        <tr>
          {columns.map((col) => {
            const active = sort?.key === col.header;
            return (
              <th key={col.header} className={`whitespace-nowrap px-3 py-2 font-semibold ${col.className ?? ""}`}>
                {col.sortAccessor ? (
                  <button
                    type="button"
                    onClick={() => setSort((s) => nextSortState(s, col.header))}
                    className="group inline-flex items-center gap-1 hover:text-slate-700"
                    aria-label={`Sắp xếp theo ${col.header}`}
                  >
                    <span>{col.header}</span>
                    <SortIcon active={active} dir={sort?.dir} />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100/80">
        {displayRows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td key={col.header} className={`px-3 py-2 align-top text-slate-700 ${col.className ? `${col.className} whitespace-normal` : "whitespace-nowrap"}`}>
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">
        {title} <span className="font-normal text-slate-400">({count})</span>
      </h3>
      <div className="overflow-hidden rounded-lg border border-slate-200/80">
        <div className="overflow-x-auto">{children}</div>
      </div>
    </section>
  );
}

export function DetailDrawer({ subject, onClose }: DetailDrawerProps) {
  const [detail, setDetail] = useState<SubjectDetail>(EMPTY_SUBJECT_DETAIL);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    setLoading(true);
    setDetail(EMPTY_SUBJECT_DETAIL);
    fetchSubjectDetail(subject)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setDetail(EMPTY_SUBJECT_DETAIL);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject]);

  useEffect(() => {
    if (!subject) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [subject, onClose]);

  if (!subject) return null;

  const title = subject.deviceName ?? subject.ipAddress ?? "Chi tiết";
  const subtitle = subject.deviceName && subject.ipAddress ? subject.ipAddress : null;

  const hasAny =
    detail.inventory.length > 0 ||
    detail.findings.length > 0 ||
    detail.reclaim.length > 0 ||
    detail.bgpSummary.length > 0 ||
    detail.bgpNeighbors.length > 0 ||
    detail.ospfInterfaces.length > 0 ||
    detail.ospfNeighbors.length > 0 ||
    detail.hwAlarmSummary.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200/80 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng bảng chi tiết"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 px-5 py-5">
          {loading && <LoadingState label="Đang tải chi tiết..." />}

          {!loading && !hasAny && (
            <EmptyState
              title="Không có bản ghi liên quan"
              description="Không có bản ghi inventory, định tuyến, kiểm tra hay thu hồi nào tham chiếu đến IP hoặc thiết bị này trong lần import gần nhất."
            />
          )}

          {!loading && (
            <>
              <DetailSection title="Inventory" count={detail.inventory.length}>
                <MiniTable
                  rows={detail.inventory}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortAccessor: (r) => r.device_name },
                    { header: "Interface", render: (r) => valueOrDash(r.interface_name), sortAccessor: (r) => r.interface_name },
                    {
                      header: "IP / Prefix",
                      render: (r) => (r.ip_address ? `${r.ip_address}/${r.prefix_length ?? "?"}` : "—"),
                      sortAccessor: (r) => r.ip_address,
                    },
                    { header: "VLAN", render: (r) => valueOrDash(r.vlan_id), sortAccessor: (r) => r.vlan_id },
                    { header: "VRF", render: (r) => valueOrDash(r.vrf_instance), sortAccessor: (r) => r.vrf_instance },
                    { header: "Dịch vụ", render: (r) => valueOrDash(r.service_type), sortAccessor: (r) => r.service_type },
                    { header: "Trạng thái", render: (r) => <StatusBadge value={r.status} />, sortAccessor: (r) => r.status },
                  ]}
                />
              </DetailSection>

              <DetailSection title="Cảnh báo phần cứng" count={detail.hwAlarmSummary.length}>
                <MiniTable
                  rows={detail.hwAlarmSummary}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortAccessor: (r) => r.device_name },
                    { header: "Tổng thể", render: (r) => <StatusBadge value={r.overall_status} />, sortAccessor: (r) => r.overall_status },
                    { header: "Critical", render: (r) => formatNumber(r.critical), sortAccessor: (r) => r.critical },
                    { header: "Major", render: (r) => formatNumber(r.major), sortAccessor: (r) => r.major },
                    { header: "Minor", render: (r) => formatNumber(r.minor), sortAccessor: (r) => r.minor },
                    { header: "Power", render: (r) => valueOrDash(r.power_status), sortAccessor: (r) => r.power_status },
                    { header: "Fan", render: (r) => valueOrDash(r.fan_status), sortAccessor: (r) => r.fan_status },
                    { header: "Nhiệt độ max", render: (r) => valueOrDash(r.max_temp), sortAccessor: (r) => r.max_temp },
                  ]}
                />
              </DetailSection>

              <DetailSection title="Phát hiện kiểm tra" count={detail.findings.length}>
                <MiniTable
                  rows={detail.findings}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Mức độ", render: (r) => <SeverityBadge severity={r.severity} />, sortAccessor: (r) => r.severity },
                    { header: "Rule", render: (r) => <RuleLabel code={r.rule_code} />, sortAccessor: (r) => r.rule_code },
                    { header: "Tiêu đề", render: (r) => r.title, className: "max-w-xs", sortAccessor: (r) => r.title },
                    { header: "Ưu tiên", render: (r) => formatNumber(r.priority_score), sortAccessor: (r) => r.priority_score },
                  ]}
                />
              </DetailSection>

              <DetailSection title="BGP Summary" count={detail.bgpSummary.length}>
                <MiniTable
                  rows={detail.bgpSummary}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortAccessor: (r) => r.device_name },
                    { header: "Trạng thái", render: (r) => <StatusBadge value={r.status} />, sortAccessor: (r) => r.status },
                    {
                      header: "Established / Total",
                      render: (r) => `${formatNumber(r.established)} / ${formatNumber(r.total_peers)}`,
                      sortAccessor: (r) => r.established,
                    },
                    {
                      header: "VPNv4 Active / Rcvd",
                      render: (r) => `${formatNumber(r.vpnv4_active)} / ${formatNumber(r.vpnv4_rcvd)}`,
                      sortAccessor: (r) => r.vpnv4_active,
                    },
                  ]}
                />
              </DetailSection>

              <DetailSection title="BGP Neighbors" count={detail.bgpNeighbors.length}>
                <MiniTable
                  rows={detail.bgpNeighbors}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortAccessor: (r) => r.device_name },
                    { header: "Neighbor IP", render: (r) => valueOrDash(r.neighbor_ip), sortAccessor: (r) => r.neighbor_ip },
                    { header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortAccessor: (r) => r.neighbor_device_name },
                    { header: "Trạng thái", render: (r) => <StatusBadge value={r.bgp_state} />, sortAccessor: (r) => r.bgp_state },
                    { header: "Flaps", render: (r) => formatNumber(r.flaps), sortAccessor: (r) => r.flaps },
                    { header: "Lỗi gần nhất", render: (r) => valueOrDash(r.last_error), className: "max-w-xs", sortAccessor: (r) => r.last_error },
                  ]}
                />
              </DetailSection>

              <DetailSection title="OSPF Interfaces" count={detail.ospfInterfaces.length}>
                <MiniTable
                  rows={detail.ospfInterfaces}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortAccessor: (r) => r.device_name },
                    { header: "Interface", render: (r) => valueOrDash(r.if_name), sortAccessor: (r) => r.if_name },
                    { header: "IF IP", render: (r) => valueOrDash(r.if_ip), sortAccessor: (r) => r.if_ip },
                    { header: "Trạng thái", render: (r) => <StatusBadge value={r.if_state} />, sortAccessor: (r) => r.if_state },
                    { header: "Area", render: (r) => valueOrDash(r.area), sortAccessor: (r) => r.area },
                    { header: "Cost", render: (r) => formatNumber(r.cost), sortAccessor: (r) => r.cost },
                  ]}
                />
              </DetailSection>

              <DetailSection title="OSPF Neighbors" count={detail.ospfNeighbors.length}>
                <MiniTable
                  rows={detail.ospfNeighbors}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Thiết bị", render: (r) => valueOrDash(r.device_name), sortAccessor: (r) => r.device_name },
                    { header: "Neighbor IP", render: (r) => valueOrDash(r.neighbor_ip), sortAccessor: (r) => r.neighbor_ip },
                    { header: "Trạng thái", render: (r) => <StatusBadge value={r.neighbor_state} />, sortAccessor: (r) => r.neighbor_state },
                    { header: "Thiết bị neighbor", render: (r) => valueOrDash(r.neighbor_device_name), sortAccessor: (r) => r.neighbor_device_name },
                  ]}
                />
              </DetailSection>

              <DetailSection title="Ứng viên thu hồi" count={detail.reclaim.length}>
                <MiniTable
                  rows={detail.reclaim}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: "Độ tin cậy", render: (r) => <StatusBadge value={r.confidence} />, sortAccessor: (r) => r.confidence },
                    { header: "Loại", render: (r) => valueOrDash(r.candidate_type), sortAccessor: (r) => r.candidate_type },
                    { header: "Điểm", render: (r) => formatNumber(r.score), sortAccessor: (r) => r.score },
                    { header: "Lý do", render: (r) => <ReasonList reason={r.reason} compact={false} />, className: "max-w-xs", sortAccessor: (r) => r.reason },
                  ]}
                />
              </DetailSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

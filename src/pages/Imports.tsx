import { useEffect, useState } from "react";
import { fetchImportBatches } from "../data/imports";
import type { ImportBatch } from "../types";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorBanner } from "../components/ErrorBanner";
import { formatDateTime, formatNumber, valueOrDash } from "../lib/format";

export function Imports() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchImportBatches()
      .then((rows) => {
        if (cancelled) return;
        setBatches(rows);
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

  const columns: Column<ImportBatch>[] = [
    { key: "created_at", header: "Tạo lúc", render: (r) => formatDateTime(r.created_at), sortable: true, sortAccessor: (r) => r.created_at },
    { key: "source_label", header: "Nguồn", render: (r) => valueOrDash(r.source_label), sortable: true, sortAccessor: (r) => r.source_label },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge value={r.status} />, sortable: true, sortAccessor: (r) => r.status },
    { key: "inventory_rows", header: "Inventory", render: (r) => formatNumber(r.inventory_rows), sortable: true, sortAccessor: (r) => r.inventory_rows },
    {
      key: "ospf",
      header: "OSPF (IF / Nbr / Err)",
      render: (r) => `${formatNumber(r.ospf_interface_rows)} / ${formatNumber(r.ospf_neighbor_rows)} / ${formatNumber(r.ospf_error_rows)}`,
      sortable: true,
      sortAccessor: (r) => r.ospf_interface_rows,
    },
    {
      key: "bgp",
      header: "BGP (Sum / Nbr / Err)",
      render: (r) => `${formatNumber(r.bgp_summary_rows)} / ${formatNumber(r.bgp_neighbor_rows)} / ${formatNumber(r.bgp_error_rows)}`,
      sortable: true,
      sortAccessor: (r) => r.bgp_summary_rows,
    },
    { key: "audit_finding_rows", header: "Kiểm tra IP", render: (r) => formatNumber(r.audit_finding_rows), sortable: true, sortAccessor: (r) => r.audit_finding_rows },
    { key: "resource_candidate_rows", header: "Ứng viên thu hồi", render: (r) => formatNumber(r.resource_candidate_rows), sortable: true, sortAccessor: (r) => r.resource_candidate_rows },
    {
      key: "hw_alarm",
      header: "HW Alarm (Sum / Det / Err)",
      render: (r) => `${formatNumber(r.hw_alarm_summary_rows)} / ${formatNumber(r.hw_alarm_detail_rows)} / ${formatNumber(r.hw_alarm_error_rows)}`,
      sortable: true,
      sortAccessor: (r) => r.hw_alarm_summary_rows,
    },
    { key: "completed_at", header: "Hoàn tất", render: (r) => formatDateTime(r.completed_at), sortable: true, sortAccessor: (r) => r.completed_at },
    { key: "notes", header: "Ghi chú", render: (r) => valueOrDash(r.notes), className: "max-w-sm", sortable: true, sortAccessor: (r) => r.notes },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch sử Import"
        description="Mỗi lần chạy `npm run import:samples` tạo một batch mới. Trang tổng quan và kiểm tra luôn phản ánh batch hoàn tất gần nhất."
      />

      {error && <ErrorBanner message={error} />}

      <DataTable
        columns={columns}
        rows={batches}
        rowKey={(r) => r.id}
        loading={loading}
        emptyTitle="Chưa có batch import nào"
        emptyDescription='Chạy "npm run import:samples" để nạp các file Excel mẫu vào Supabase.'
      />
    </div>
  );
}

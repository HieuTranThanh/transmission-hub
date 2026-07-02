import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import type { SortState } from "../types";

export type { SortState } from "../types";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Show a clickable sort affordance on this column's header. */
  sortable?: boolean;
  /** Sort identity. Server-side tables: the DB column to order by. Defaults to `key`. */
  sortKey?: string;
  /** Client-side sorting only: the value used to compare rows in the browser. */
  sortAccessor?: (row: T) => string | number | null | undefined;
}

/** A column's stable sort identity (DB column for server tables, just an id for client tables). */
function sortIdOf<T>(col: Column<T>): string {
  return col.sortKey ?? col.key;
}

/** 3-state cycle: not sorted → A-Z (asc) → Z-A (desc) → not sorted. */
export function nextSortState(current: SortState | null | undefined, key: string): SortState | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

/** Client-side comparator. Empty values sort last; numbers numerically; text via Vietnamese collation. */
export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
}

export function SortIcon({ active, dir }: { active: boolean; dir?: SortState["dir"] }) {
  if (active && dir === "asc") return <ArrowUp className="h-3.5 w-3.5 text-brand-600" />;
  if (active && dir === "desc") return <ArrowDown className="h-3.5 w-3.5 text-brand-600" />;
  return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" />;
}

interface PaginationFooterProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

function PaginationFooter({ page, pageSize, totalCount, onPageChange }: PaginationFooterProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm">
      <span className="text-slate-500">
        Hiển thị <span className="font-medium text-slate-700">{from.toLocaleString()}–{to.toLocaleString()}</span> / {totalCount.toLocaleString()} kết quả
      </span>
      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-sm text-slate-400">
          {page + 1}/{totalPages}
        </span>
        <button
          type="button"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 0}
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          onClick={() => onPageChange(page + 1)}
          disabled={page + 1 >= totalPages}
          aria-label="Trang sau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  /**
   * Sorting. When `onSortChange` is provided the table is controlled (server-side
   * ordering): the parent owns `sort` and re-fetches. Otherwise the table sorts
   * its `rows` in-browser using each sortable column's `sortAccessor`.
   */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = "Không có dữ liệu",
  emptyDescription,
  onRowClick,
  page,
  pageSize,
  totalCount,
  onPageChange,
  sort,
  onSortChange,
  rowClassName,
}: DataTableProps<T>) {
  const controlled = onSortChange !== undefined;
  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const activeSort = controlled ? sort ?? null : internalSort;

  function toggleSort(key: string) {
    const next = nextSortState(activeSort, key);
    if (controlled) onSortChange?.(next);
    else setInternalSort(next);
  }

  // Server-side tables arrive pre-sorted; only reorder for client-side sorting.
  let displayRows = rows;
  if (!controlled && activeSort) {
    const col = columns.find((c) => sortIdOf(c) === activeSort.key);
    if (col?.sortAccessor) {
      const accessor = col.sortAccessor;
      const factor = activeSort.dir === "asc" ? 1 : -1;
      displayRows = [...rows].sort((a, b) => factor * compareValues(accessor(a), accessor(b)));
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className={`relative max-h-[75vh] overflow-auto ${loading ? "min-h-[200px]" : ""}`}>
        <table className={`w-full min-w-max text-left text-sm transition-opacity ${loading && displayRows.length > 0 ? "opacity-40 pointer-events-none" : ""}`}>
          <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 text-sm text-slate-500 backdrop-blur-sm">
            <tr>
              {columns.map((col) => {
                const sortId = sortIdOf(col);
                const active = activeSort?.key === sortId;
                return (
                  <th key={col.key} className={`whitespace-nowrap px-4 py-3 font-semibold ${col.className ?? ""}`}>
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(sortId)}
                        className="group inline-flex items-center gap-1 hover:text-slate-700"
                        aria-label={`Sắp xếp theo ${col.header}`}
                      >
                        <span>{col.header}</span>
                        <SortIcon active={active} dir={activeSort?.dir} />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {displayRows.length > 0 && (
            <tbody className="divide-y divide-slate-100/80">
              {displayRows.map((row, idx) => (
                <tr
                  key={rowKey(row)}
                  className={`transition-colors ${onRowClick ? "cursor-pointer hover:bg-brand-50/40" : ""} ${idx % 2 === 1 ? "bg-slate-50/40" : ""} ${rowClassName?.(row) ?? ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-2.5 align-top text-slate-700 ${col.className ? `${col.className} whitespace-normal` : "whitespace-nowrap"}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <LoadingState />
          </div>
        )}
      </div>

      {!loading && rows.length === 0 && (
        <div className="border-t border-slate-100 p-2">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}

      {!loading &&
        rows.length > 0 &&
        page !== undefined &&
        pageSize !== undefined &&
        totalCount !== undefined &&
        onPageChange && (
          <PaginationFooter page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={onPageChange} />
        )}
    </div>
  );
}

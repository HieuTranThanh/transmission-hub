import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
      {children}
    </div>
  );
}

const fieldLabel = "text-sm font-semibold text-slate-500";
const baseControl =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export type MultiSelectOption = string | { value: string; label: string };

export function FilterMultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Tất cả",
  countLabel = "mục đã chọn",
}: {
  label?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  countLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const itemValues = new Set(items.map((o) => o.value));
  const activeCount = selected.filter((v) => itemValues.has(v)).length;
  const allVisibleChecked = items.length > 0 && items.every((o) => selected.includes(o.value));
  const showPlaceholder = allVisibleChecked && items.length > 1;
  const noneActive = activeCount === 0;

  const summary = showPlaceholder || (noneActive && items.length === 0)
    ? placeholder
    : noneActive
      ? "Chưa chọn mục nào"
      : activeCount === 1
        ? items.find((o) => selected.includes(o.value))?.label ?? selected[0]
        : `${activeCount} ${countLabel}`;

  return (
    <div ref={ref} className="relative flex min-w-[12rem] flex-1 flex-col gap-1.5">
      {label && <span className={fieldLabel}>{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${baseControl} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${noneActive && !showPlaceholder ? "text-slate-400" : ""}`}>{summary}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[16rem] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white py-1 shadow-lg sm:min-w-[22rem] sm:max-w-2xl">
          <button
            type="button"
            onClick={() => {
              if (allVisibleChecked) {
                onChange(selected.filter((v) => !itemValues.has(v)));
              } else {
                onChange([...new Set([...selected, ...items.map((o) => o.value)])]);
              }
            }}
            className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm font-semibold text-brand-600 hover:bg-slate-50"
          >
            {allVisibleChecked ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Không có lựa chọn</div>}
            {items.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span className="text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="flex min-w-[14rem] flex-[2] flex-col gap-1.5">
      {label && <span className={fieldLabel}>{label}</span>}
      <input
        type="text"
        className={baseControl}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function ExportButton({ onClick, disabled, loading }: { onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {loading ? "Đang xuất…" : "Xuất Excel"}
    </button>
  );
}

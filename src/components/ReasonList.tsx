import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/** Renders a reclaim candidate's `reason` text (each factor on its own
 * `\n`-separated line). In `compact` mode (default — used in list tables)
 * only the single most relevant factor is shown, plus a "+N lý do khác"
 * toggle. Clicking the toggle expands the full bulleted list inline (without
 * opening the detail drawer). In full mode (the detail drawer itself) every
 * factor is always shown as its own bullet. Falls back to plain text for
 * single-line values (e.g. data imported before reasons were split onto
 * separate lines). */
export function ReasonList({ reason, compact = true }: { reason: string | null | undefined; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!reason) return <span className="text-slate-400">—</span>;

  const parts = reason.split("\n").filter((p) => p.trim() !== "");
  if (parts.length <= 1) return <span>{reason}</span>;

  if (!compact) {
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {parts.map((part, i) => (
          <li key={i}>{part}</li>
        ))}
      </ul>
    );
  }

  const highlight =
    parts.find((p) => p.startsWith("CẢNH BÁO")) ??
    parts.find((p) => p.includes("an toàn để thu hồi")) ??
    parts[0];
  const highlightClass = highlight.startsWith("CẢNH BÁO")
    ? "font-medium text-severity-critical"
    : highlight.includes("an toàn để thu hồi")
      ? "text-severity-ok"
      : "text-slate-700";
  const rest = parts.length - 1;

  if (expanded) {
    return (
      <div className="space-y-0.5">
        <ul className="list-disc space-y-0.5 pl-4">
          {parts.map((part, i) => (
            <li key={i} className={part === highlight ? highlightClass : undefined}>
              {part}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronDown className="h-3 w-3" />
          Thu gọn
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className={highlightClass}>{highlight}</div>
      {rest > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronRight className="h-3 w-3" />
          +{rest} lý do khác
        </button>
      )}
    </div>
  );
}

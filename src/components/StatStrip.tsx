type Tone = "default" | "critical" | "high" | "medium" | "low" | "ok" | "info";

export interface StatItem {
  label: string;
  value: string | number;
  tone?: Tone;
  delta?: number | null;
  deltaInverted?: boolean;
}

const DOT_COLORS: Record<Tone, string> = {
  default: "",
  critical: "bg-severity-critical",
  high: "bg-severity-high",
  medium: "bg-severity-medium",
  low: "bg-severity-low",
  ok: "bg-severity-ok",
  info: "bg-severity-info",
};

const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
  7: "grid-cols-2 sm:grid-cols-4 xl:grid-cols-7",
  8: "grid-cols-2 sm:grid-cols-4 xl:grid-cols-8",
  9: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9",
};

function DeltaBadge({ delta, inverted }: { delta?: number | null; inverted?: boolean }) {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) return <span className="text-sm font-medium text-slate-400">=</span>;
  const isUp = delta > 0;
  const arrow = isUp ? "↑" : "↓";
  const absVal = Math.abs(delta).toLocaleString("en-US");
  const isGood = inverted ? !isUp : isUp;
  const colorClass = isGood ? "text-severity-ok" : "text-severity-critical";
  return (
    <span className={`text-sm font-semibold ${colorClass}`}>
      {arrow}{absVal}
    </span>
  );
}

function StatGrid({ items }: { items: StatItem[] }) {
  const gridCols = GRID_COLS[items.length] ?? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
  return (
    <div className={`grid ${gridCols}`}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col overflow-hidden border-b border-r border-slate-50 px-5 py-4">
          <div className="mb-2 flex items-start gap-2">
            {item.tone && item.tone !== "default" && (
              <span className={`mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[item.tone]}`} />
            )}
            <span className="text-sm font-medium leading-tight text-slate-500">
              {item.label}
            </span>
          </div>
          <div className="mt-auto flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums tracking-tight text-slate-900">{item.value}</span>
            <DeltaBadge delta={item.delta} inverted={item.deltaInverted} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-3">
      <span className="text-sm font-semibold text-slate-600">{title}</span>
    </div>
  );
}

export function StatStrip({ title, items }: { title?: string; items: StatItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      {title && <SectionHeader title={title} />}
      <StatGrid items={items} />
    </div>
  );
}

export interface StatSection {
  title: string;
  items: StatItem[];
}

export function StatStripGroup({ sections }: { sections: StatSection[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      {sections.map((section) => (
        <div key={section.title}>
          <SectionHeader title={section.title} />
          <StatGrid items={section.items} />
        </div>
      ))}
    </div>
  );
}

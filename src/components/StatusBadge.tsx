import { badgeInfo } from "../lib/glossary";
import { Tooltip, TooltipBody } from "./Tooltip";

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
  good: "bg-severity-ok/10 text-severity-ok border-severity-ok/25",
  warn: "bg-severity-medium/10 text-severity-medium border-severity-medium/25",
  bad: "bg-severity-critical/10 text-severity-critical border-severity-critical/25",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

const VALUE_TONES: Record<string, Tone> = {
  active: "good",
  established: "good",
  full: "good",
  ok: "good",
  high: "good",
  up: "good",
  enabled: "good",
  completed: "good",

  "up/no-peer": "warn",
  warning: "warn",
  connect: "warn",
  medium: "warn",
  running: "warn",

  "admin-down": "neutral",
  low: "neutral",
  new: "neutral",
  acknowledged: "neutral",

  "link-down": "bad",
  failed: "bad",
  error: "bad",
  idle: "bad",
  down: "bad",
  init: "bad",
  critical: "bad",
  major: "warn",
  minor: "neutral",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const tone = VALUE_TONES[value.toLowerCase()] ?? "neutral";
  const badge = (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${TONE_STYLES[tone]}`}
    >
      {value}
    </span>
  );

  const info = badgeInfo(value);
  if (!info) return badge;
  return (
    <Tooltip content={<TooltipBody title={value} subtitle={info.label} description={info.description} action={info.action} />}>
      {badge}
    </Tooltip>
  );
}

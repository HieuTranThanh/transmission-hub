import type { Severity } from "../types";
import { SEVERITY_INFO } from "../lib/glossary";
import { Tooltip, TooltipBody } from "./Tooltip";

const STYLES: Record<Severity, string> = {
  Critical: "bg-severity-critical/10 text-severity-critical border-severity-critical/25",
  High: "bg-severity-high/10 text-severity-high border-severity-high/25",
  Medium: "bg-severity-medium/10 text-severity-medium border-severity-medium/25",
  Low: "bg-severity-low/10 text-severity-low border-severity-low/25",
  Info: "bg-severity-info/10 text-severity-info border-severity-info/25",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const info = SEVERITY_INFO[severity];
  return (
    <Tooltip
      content={<TooltipBody title={severity} subtitle={info.label} description={info.description} action={info.action} />}
    >
      <span
        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${STYLES[severity]}`}
      >
        {severity}
      </span>
    </Tooltip>
  );
}

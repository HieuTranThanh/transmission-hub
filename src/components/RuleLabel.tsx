import { RULE_INFO } from "../lib/glossary";
import { Tooltip, TooltipBody } from "./Tooltip";

/** Renders an audit rule_code; when the rule is known, a dotted-underline marks
 * it as hoverable and a tooltip explains what it means + the recommended
 * action. Full list lives on the /glossary page. */
export function RuleLabel({ code }: { code: string | null | undefined }) {
  if (!code) return <span className="text-slate-400">—</span>;

  const info = RULE_INFO[code];
  if (!info) return <span className="font-mono text-slate-600">{code}</span>;

  return (
    <Tooltip
      content={<TooltipBody title={code} subtitle={info.label} description={info.description} action={info.action} />}
    >
      <span className="font-mono text-slate-600 underline decoration-dotted decoration-slate-400 underline-offset-2">
        {code}
      </span>
    </Tooltip>
  );
}

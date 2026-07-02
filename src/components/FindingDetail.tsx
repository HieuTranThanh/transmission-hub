/** Renders an audit finding's `detail` text. Each "; "-separated line is one
 * affected interface in the form "DEVICE / INTERFACE [VRF x] (status)"; the
 * leading device name is emphasized (bold + accent colour) so multiple devices
 * are easy to tell apart at a glance. Lines that don't have the "DEVICE / ..."
 * shape (e.g. gateway/status detail sentences) are shown as-is. */
export function FindingDetail({ detail }: { detail: string | null | undefined }) {
  if (!detail) return <span className="text-slate-400">—</span>;
  return (
    <ul className="space-y-0.5 text-sm text-slate-600">
      {detail.split("; ").map((line, i) => {
        const sep = line.indexOf(" / ");
        if (sep === -1) return <li key={i}>{line}</li>;
        return (
          <li key={i}>
            <span className="font-semibold text-brand-700">{line.slice(0, sep)}</span>
            {line.slice(sep)}
          </li>
        );
      })}
    </ul>
  );
}

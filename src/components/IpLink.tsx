import { Link } from "react-router-dom";

/**
 * Renders an IP address / CIDR value as a link to "Trung tâm tra cứu"
 * (/search?q=value) so users can jump from any table straight to a full
 * cross-reference of that address. Stops click propagation so it doesn't
 * also trigger a parent row's onRowClick (e.g. opening the DetailDrawer).
 */
export function IpLink({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <Link
      to={`/search?q=${encodeURIComponent(value)}`}
      onClick={(e) => e.stopPropagation()}
      className="text-brand-600 hover:underline"
      title={`Tra cứu "${value}"`}
    >
      {value}
    </Link>
  );
}

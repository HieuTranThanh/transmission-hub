import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Search as SearchIcon } from "lucide-react";

export function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (location.pathname === "/search") {
      setValue(searchParams.get("q") ?? "");
    }
  }, [location.pathname, searchParams]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-lg">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tìm IP, subnet, thiết bị, interface, VLAN, VRF, mô tả port, rule..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm transition-all focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    </form>
  );
}

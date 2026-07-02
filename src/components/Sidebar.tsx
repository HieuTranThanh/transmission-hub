import { NavLink } from "react-router-dom";
import { LayoutDashboard, Search, ShieldAlert, Activity, AlertTriangle, Recycle, Share2, History, BookOpen, X } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "/search", label: "Trung tâm tra cứu", icon: Search, end: false },
  { to: "/hw-alarm", label: "Cảnh báo phần cứng", icon: AlertTriangle, end: false },
  { to: "/ip-audit", label: "Kiểm tra IP", icon: ShieldAlert, end: false },
  { to: "/routing", label: "Tình trạng định tuyến", icon: Activity, end: false },
  { to: "/reclaim", label: "Thu hồi tài nguyên", icon: Recycle, end: false },
  { to: "/topology", label: "Topology", icon: Share2, end: false },
  { to: "/imports", label: "Lịch sử Import", icon: History, end: false },
  { to: "/glossary", label: "Chú giải", icon: BookOpen, end: false },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-60 flex-shrink-0 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200/80 px-4 py-4">
          <img src="/favicon.png" alt="Transmission Hub" className="h-9 w-9 rounded-lg shadow-sm" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold tracking-tight text-slate-900">Transmission Hub</div>
            <div className="text-xs text-slate-400">Tra cứu dữ liệu truyền dẫn</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-500"}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
          © 2026 Hieu.TranThanh
        </div>
      </aside>
    </>
  );
}

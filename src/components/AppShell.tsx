import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AlertTriangle, Menu, RotateCw } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { GlobalSearch } from "./GlobalSearch";
import { LoadingState } from "./LoadingState";
import { isSupabaseConfigured } from "../lib/supabase";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-sm lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
        </header>
        {!isSupabaseConfigured && (
          <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 lg:px-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span className="flex-1">
              Chưa cấu hình Supabase. Hãy đặt <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-sm">VITE_SUPABASE_URL</code> và{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-sm">VITE_SUPABASE_ANON_KEY</code> trong file <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-sm">.env</code> rồi
              khởi động lại dev server — nếu không, mọi trang sẽ báo lỗi tải dữ liệu.
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white/70 px-3 py-1 text-sm font-medium text-amber-800 shadow-sm hover:bg-white"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Tải lại
            </button>
          </div>
        )}
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

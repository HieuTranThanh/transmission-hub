import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";

// Pages are lazy-loaded so the initial bundle only ships the shell + the route
// the user actually lands on; the rest are fetched on first navigation. The
// Suspense fallback lives around the <Outlet /> in AppShell.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const SearchPage = lazy(() => import("./pages/SearchPage").then((m) => ({ default: m.SearchPage })));
const IpAudit = lazy(() => import("./pages/IpAudit").then((m) => ({ default: m.IpAudit })));
const Routing = lazy(() => import("./pages/Routing").then((m) => ({ default: m.Routing })));
const HwAlarm = lazy(() => import("./pages/HwAlarm").then((m) => ({ default: m.HwAlarm })));
const Reclaim = lazy(() => import("./pages/Reclaim").then((m) => ({ default: m.Reclaim })));
const Topology = lazy(() => import("./pages/Topology").then((m) => ({ default: m.Topology })));
const Imports = lazy(() => import("./pages/Imports").then((m) => ({ default: m.Imports })));
const Glossary = lazy(() => import("./pages/Glossary").then((m) => ({ default: m.Glossary })));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/hw-alarm" element={<HwAlarm />} />
          <Route path="/ip-audit" element={<IpAudit />} />
          <Route path="/routing" element={<Routing />} />
          <Route path="/reclaim" element={<Reclaim />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

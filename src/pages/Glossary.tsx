import { useState, type ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import { SeverityBadge } from "../components/SeverityBadge";
import { StatusBadge } from "../components/StatusBadge";
import {
  SEVERITY_INFO,
  CONFIDENCE_INFO,
  STATUS_INFO,
  RULE_INFO,
  RECLAIM_ELIGIBILITY,
  RECLAIM_SCORE_FACTORS,
  RECLAIM_CONFIDENCE_RULE,
  HW_ALARM_OVERALL_INFO,
  HW_ALARM_CATEGORY_INFO,
  type TermInfo,
  type ScoreFactor,
} from "../lib/glossary";
import type { Severity, Confidence } from "../types";

function Subsection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-700">{title}</h3>
        {description && <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-card">{children}</div>
    </div>
  );
}

function Row({ badge, info }: { badge: ReactNode; info: TermInfo }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex-shrink-0 pt-0.5 sm:w-36">{badge}</div>
      <div className="min-w-0 text-sm">
        <span className="font-medium text-slate-700">{info.label}</span>
        <span className="text-slate-500"> — {info.description}</span>
        {info.action && <span className="block text-sm text-slate-500">Khuyến nghị: {info.action}</span>}
      </div>
    </div>
  );
}

function ScoreFactorTable({ factors }: { factors: ScoreFactor[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-sm text-slate-500">
        <tr>
          <th className="px-4 py-2 font-semibold">Yếu tố</th>
          <th className="px-4 py-2 font-semibold">Điểm</th>
          <th className="px-4 py-2 font-semibold">Ý nghĩa</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {factors.map((f) => (
          <tr key={f.label}>
            <td className="px-4 py-2 align-top text-slate-700">{f.label}</td>
            <td
              className={`px-4 py-2 align-top font-mono ${
                f.points.startsWith("−") ? "text-severity-critical" : "text-severity-ok"
              }`}
            >
              {f.points}
            </td>
            <td className="px-4 py-2 align-top text-slate-500">{f.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SEVERITY_ORDER: Severity[] = ["Critical", "High", "Medium", "Low", "Info"];
const CONFIDENCE_ORDER: Confidence[] = ["High", "Medium", "Low"];

const INTERFACE_STATUS_KEYS = ["active", "admin-down", "link-down", "up/no-peer", "failed"];
const BGP_STATUS_KEYS = ["established", "idle", "connect", "ok", "warning", "error"];
const OSPF_STATUS_KEYS = ["full", "init"];
const BATCH_STATUS_KEYS = ["completed", "running", "new", "acknowledged"];

const IP_RULE_CATEGORIES = ["IP Duplicate", "Network", "Gateway", "Status", "Prefix"];
const ROUTING_RULE_CATEGORIES = ["BGP", "OSPF"];

function StatusRows({ keys }: { keys: string[] }) {
  return (
    <>
      {keys
        .filter((k) => STATUS_INFO[k])
        .map((k) => (
          <Row key={k} badge={<StatusBadge value={statusLabel(k)} />} info={STATUS_INFO[k]} />
        ))}
    </>
  );
}

/** The status values are stored with original casing in the data; show a
 * representative cased form in the badge so tone matching still works. */
function statusLabel(lowerKey: string): string {
  const map: Record<string, string> = {
    active: "Active",
    "admin-down": "Admin-Down",
    "link-down": "Link-Down",
    "up/no-peer": "Up/No-Peer",
    failed: "Failed",
    established: "Established",
    idle: "Idle",
    connect: "Connect",
    full: "Full",
    init: "Init",
    ok: "OK",
    warning: "WARNING",
    error: "ERROR",
    completed: "Completed",
    running: "Running",
    new: "New",
    acknowledged: "Acknowledged",
  };
  return map[lowerKey] ?? lowerKey;
}

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

function HwAlarmTab() {
  return (
    <div className="space-y-6">
      <Subsection title="Trạng thái tổng thể thiết bị" description="Kết quả tổng hợp từ tất cả sensor và alarm trên thiết bị.">
        {(["critical", "warning", "ok"] as const).map((k) => (
          <Row key={k} badge={<StatusBadge value={statusLabel(k)} />} info={HW_ALARM_OVERALL_INFO[k]} />
        ))}
      </Subsection>

      <Subsection title="Nhóm cảnh báo (Category)" description="Mỗi dòng chi tiết thuộc một trong các nhóm sau.">
        {Object.entries(HW_ALARM_CATEGORY_INFO).map(([key, info]) => (
          <Row key={key} badge={<span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-700">{info.label}</span>} info={info} />
        ))}
      </Subsection>

      <Subsection title="Highlight dòng bất thường" description="Trong tab Chi tiết cảnh báo, các dòng nền đỏ nhạt cho biết sensor/alarm đó đang ở trạng thái bất thường.">
        <div className="px-4 py-3 text-sm text-slate-600 space-y-2">
          <p><span className="font-medium">Dòng Alarm</span> (có Severity): luôn được highlight.</p>
          <p><span className="font-medium">Dòng Environment</span> (LED, Fan, Power, Temperature, Card, External Alarm): highlight khi status <strong>không</strong> thuộc các giá trị bình thường — <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">ok</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">up</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">normal</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">off</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">not asserted</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">alarm cleared</code>.</p>
        </div>
      </Subsection>
    </div>
  );
}

function RuleGroups({ categories }: { categories: string[] }) {
  const groups = categories.map((category) => ({
    category,
    rules: Object.entries(RULE_INFO).filter(([, info]) => info.category === category),
  })).filter((g) => g.rules.length > 0);

  return (
    <>
      {groups.map((group) => (
        <div key={group.category}>
          <div className="bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-400">
            {group.category}
          </div>
          {group.rules.map(([code, info]) => (
            <div key={code} className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex-shrink-0 sm:w-56">
                <div className="font-mono text-sm text-slate-700">{code}</div>
                <div className="text-sm text-slate-500">{info.severity}</div>
              </div>
              <div className="min-w-0 text-sm">
                <span className="font-medium text-slate-700">{info.label}</span>
                <span className="text-slate-500"> — {info.description}</span>
                {info.action && <span className="block text-sm text-slate-500">Khuyến nghị: {info.action}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function IpAuditTab() {
  return (
    <div className="space-y-6">
      <Subsection title="Mức độ ưu tiên" description="Bảng phát hiện mặc định sắp theo điểm ưu tiên xử lý.">
        {SEVERITY_ORDER.map((sev) => (
          <Row key={sev} badge={<SeverityBadge severity={sev} />} info={SEVERITY_INFO[sev]} />
        ))}
      </Subsection>

      <Subsection title="Rule kiểm tra IP" description="Các rule phát hiện lỗi/nguy cơ liên quan đến IP, network, gateway, trạng thái interface.">
        <RuleGroups categories={IP_RULE_CATEGORIES} />
      </Subsection>
    </div>
  );
}

function RoutingTab() {
  return (
    <div className="space-y-6">
      <Subsection title="Trạng thái BGP / OSPF">
        <div className="bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-400">
          BGP
        </div>
        <StatusRows keys={BGP_STATUS_KEYS} />
        <div className="bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-400">
          OSPF
        </div>
        <StatusRows keys={OSPF_STATUS_KEYS} />
      </Subsection>

      <Subsection title="Rule kiểm tra BGP / OSPF" description="Các rule phát hiện bất thường trong định tuyến.">
        <RuleGroups categories={ROUTING_RULE_CATEGORIES} />
      </Subsection>
    </div>
  );
}

function ReclaimTab() {
  return (
    <div className="space-y-6">
      <Subsection
        title="Cách tính điểm thu hồi (score)"
        description={RECLAIM_ELIGIBILITY}
      >
        <ScoreFactorTable factors={RECLAIM_SCORE_FACTORS} />
        <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">{RECLAIM_CONFIDENCE_RULE}</p>
      </Subsection>

      <Subsection title="Độ tin cậy thu hồi" description="Quy đổi từ tổng điểm — xem cách tính ở bảng trên.">
        {CONFIDENCE_ORDER.map((c) => (
          <Row key={c} badge={<StatusBadge value={c} />} info={CONFIDENCE_INFO[c]} />
        ))}
      </Subsection>
    </div>
  );
}

function GeneralTab() {
  return (
    <div className="space-y-6">
      <Subsection title="Trạng thái interface" description="Trạng thái interface lấy trực tiếp từ dữ liệu mạng (inventory, current_status, link).">
        <StatusRows keys={INTERFACE_STATUS_KEYS} />
      </Subsection>

      <Subsection title="Trạng thái batch / phát hiện" description="Trạng thái batch import và phát hiện kiểm tra.">
        <StatusRows keys={BATCH_STATUS_KEYS} />
      </Subsection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = "hw-alarm" | "ip-audit" | "routing" | "reclaim" | "general";

const TABS: { id: TabId; label: string; description: string }[] = [
  { id: "hw-alarm", label: "Cảnh báo phần cứng", description: "Trạng thái tổng thể thiết bị và nhóm sensor/alarm thu thập từ thiết bị mạng (Nokia, Cisco, Juniper)." },
  { id: "ip-audit", label: "Kiểm tra IP", description: "Mức độ ưu tiên và rule áp dụng cho các phát hiện kiểm tra (audit findings)." },
  { id: "routing", label: "Tình trạng định tuyến", description: "Trạng thái BGP/OSPF." },
  { id: "reclaim", label: "Thu hồi tài nguyên", description: "Cách tính điểm, độ tin cậy thu hồi." },
  { id: "general", label: "Chung", description: "Trạng thái interface, batch import — dùng chung nhiều trang." },
];

const TAB_CONTENT: Record<TabId, () => ReactNode> = {
  "hw-alarm": () => <HwAlarmTab />,
  "ip-audit": () => <IpAuditTab />,
  routing: () => <RoutingTab />,
  reclaim: () => <ReclaimTab />,
  general: () => <GeneralTab />,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Glossary() {
  const [tab, setTab] = useState<TabId>("hw-alarm");
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chú giải"
        description="Giải thích ý nghĩa các nhãn dùng trong toàn bộ ứng dụng. Rê chuột vào badge ở các trang khác cũng hiện giải thích nhanh."
      />

      <div className="flex flex-wrap gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/50"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500">{current.description}</p>

      {TAB_CONTENT[tab]()}
    </div>
  );
}

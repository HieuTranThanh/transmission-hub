// Single source of truth for the human-readable meaning of every label shown
// in the UI (severity, reclaim confidence, status/state values, audit rules).
// Both the hover tooltips (SeverityBadge / StatusBadge / RuleLabel) and the
// "Chú giải" (Glossary) page read from here, so a description is edited once.

import type { Severity, Confidence } from "../types";

export interface TermInfo {
  /** Short Vietnamese label, e.g. "Lỗi nghiêm trọng". */
  label: string;
  /** One-sentence meaning. */
  description: string;
  /** Optional recommended action for the operator. */
  action?: string;
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const SEVERITY_INFO: Record<Severity, TermInfo> = {
  Critical: {
    label: "Lỗi nghiêm trọng",
    description: "Có nguy cơ ảnh hưởng trực tiếp tới vận hành ngay lập tức.",
    action: "Xử lý đầu tiên.",
  },
  High: {
    label: "Rủi ro cao",
    description: "Khả năng gây sự cố lớn, cần được ưu tiên xử lý sớm.",
    action: "Xử lý sớm.",
  },
  Medium: {
    label: "Rủi ro trung bình",
    description: "Bất thường cần được xem xét, chưa ảnh hưởng vận hành ngay.",
    action: "Lên kế hoạch xử lý.",
  },
  Low: {
    label: "Rủi ro thấp",
    description: "Sai lệch nhỏ trong khai báo, ít ảnh hưởng.",
    action: "Kiểm tra khi có thời gian.",
  },
  Info: {
    label: "Thông tin",
    description: "Mang tính tham khảo, không phải lỗi.",
  },
};

// ---------------------------------------------------------------------------
// Reclaim confidence
// ---------------------------------------------------------------------------

export const CONFIDENCE_INFO: Record<Confidence, TermInfo> = {
  High: {
    label: "Khả năng thu hồi cao",
    description: "Điểm thu hồi ≥ 70 — gần như chắc chắn tài nguyên không còn được dùng.",
    action: "Có thể thu hồi sau khi xác nhận nhanh.",
  },
  Medium: {
    label: "Khả năng thu hồi trung bình",
    description: "Điểm thu hồi 40–69 — nhiều khả năng không dùng nhưng cần kiểm chứng.",
    action: "Xác minh trước khi thu hồi.",
  },
  Low: {
    label: "Khả năng thu hồi thấp",
    description: "Điểm thu hồi < 40 — còn dấu hiệu có thể đang dùng.",
    action: "Cân nhắc kỹ trước khi thu hồi.",
  },
};

// ---------------------------------------------------------------------------
// Reclaim scoring — how `score` (and the resulting confidence) is computed.
// Mirrors scripts/lib/reclaim-rules.ts; update both together.
// ---------------------------------------------------------------------------

export interface ScoreFactor {
  /** Short Vietnamese label for the factor. */
  label: string;
  /** Signed point delta as shown to users, e.g. "+30" or "−50". */
  points: string;
  /** One-sentence meaning of the factor. */
  description: string;
}

export const RECLAIM_ELIGIBILITY =
  "Một IP trở thành ứng viên thu hồi nếu status là Admin-Down, Link-Down hoặc Up/No-Peer, hoặc oper_state = Down.";

export const RECLAIM_SCORE_FACTORS: ScoreFactor[] = [
  { label: "Trạng thái Admin-Down", points: "+30", description: "Interface bị shutdown chủ động." },
  { label: "Trạng thái Link-Down", points: "+25", description: "Mất link vật lý." },
  { label: "Trạng thái Up/No-Peer", points: "+20", description: "Interface Up nhưng không thấy thiết bị đối diện." },
  { label: "Không xuất hiện trong OSPF", points: "+20", description: "IP không nằm trong cấu hình OSPF interface nào." },
  { label: "Không xuất hiện trong BGP", points: "+20", description: "IP không nằm trong cấu hình BGP neighbor nào." },
  { label: "Port description đang trống", points: "+10", description: "Không có mô tả cổng — dấu hiệu lâu rồi không ai cập nhật." },
  { label: "Là Loopback", points: "−30", description: "Loopback thường vẫn được giữ lại dù không thấy trong OSPF/BGP." },
  {
    label: "IP trùng, đang Active ở interface/thiết bị khác",
    points: "−50",
    description: "Địa chỉ chưa thực sự rảnh — không an toàn để thu hồi.",
  },
  {
    label: "IP trùng nhưng không Active ở nơi khác",
    points: "−15",
    description: "Còn khai báo trùng ở nơi khác nhưng không nơi nào đang dùng.",
  },
];

export const RECLAIM_CONFIDENCE_RULE =
  "Tổng điểm bắt đầu từ 0 và cộng/trừ theo các yếu tố ở trên. Độ tin cậy suy ra trực tiếp từ tổng điểm: " +
  "High khi điểm ≥ 70, Medium khi điểm từ 40–69, Low khi điểm < 40. " +
  "Ngoại lệ an toàn: nếu IP đang trùng và Active ở interface/thiết bị khác, độ tin cậy luôn bị ép về Low bất kể tổng điểm.";

// ---------------------------------------------------------------------------
// HW Alarm — overall_status & environment detail status
// ---------------------------------------------------------------------------

export const HW_ALARM_OVERALL_INFO: Record<string, TermInfo> = {
  critical: {
    label: "Thiết bị cảnh báo nghiêm trọng",
    description: "Có ít nhất 1 cảnh báo Critical (alarm hoặc sensor bất thường nghiêm trọng).",
    action: "Kiểm tra thiết bị ngay.",
  },
  warning: {
    label: "Thiết bị cảnh báo",
    description: "Có ít nhất 1 cảnh báo Warning (sensor bất thường nhưng chưa nghiêm trọng).",
    action: "Lên kế hoạch kiểm tra.",
  },
  ok: {
    label: "Thiết bị bình thường",
    description: "Tất cả sensor và alarm đều ở trạng thái bình thường.",
  },
};

export const HW_ALARM_CATEGORY_INFO: Record<string, TermInfo> = {
  alarm: {
    label: "System Alarm",
    description: "Cảnh báo hệ thống do thiết bị tự phát (show system alarms / show facility-alarm). Có Severity.",
  },
  led: {
    label: "LED",
    description: 'Trạng thái đèn LED trên thiết bị. "off" = bình thường, "Red"/"ON" = bất thường.',
  },
  temperature: {
    label: "Nhiệt độ",
    description: 'Sensor nhiệt độ trên card/module. "ok"/"Normal" = bình thường.',
  },
  fan: {
    label: "Quạt tản nhiệt",
    description: 'Trạng thái quạt. "up"/"Normal" = bình thường, khác = bất thường.',
  },
  power: {
    label: "Nguồn điện",
    description: 'Trạng thái bộ nguồn (PSU). "up"/"Normal"/"OK" = bình thường.',
  },
  card: {
    label: "Card / Module",
    description: 'Trạng thái alarm trên card. "alarm cleared" = bình thường.',
  },
  "external alarm": {
    label: "External Alarm",
    description: 'Cảnh báo ngoại vi (Cisco). "not asserted" = bình thường, "asserted" = bất thường.',
  },
};

// ---------------------------------------------------------------------------
// Status / state values (inventory status, BGP/OSPF state, BGP summary status).
// Keyed by the lower-cased value so lookups are case-insensitive.
// ---------------------------------------------------------------------------

export const STATUS_INFO: Record<string, TermInfo> = {
  active: {
    label: "Đang hoạt động",
    description: "Interface bật và hoạt động (admin/oper Up, có gateway).",
  },
  "admin-down": {
    label: "Tắt chủ động",
    description: "Bị shutdown bằng lệnh quản trị (admin down).",
  },
  "link-down": {
    label: "Mất link",
    description: "Cổng vật lý/đường truyền đang down.",
  },
  "up/no-peer": {
    label: "Up nhưng chưa thấy đầu xa",
    description: "Interface Up nhưng không có gateway / chưa thấy thiết bị đối diện.",
  },
  failed: {
    label: "Thu thập thất bại",
    description: "Không kết nối/đăng nhập được thiết bị khi thu thập (auth/timeout).",
  },

  // BGP neighbor state
  established: {
    label: "BGP đã thiết lập",
    description: "Phiên BGP ở trạng thái Established — bình thường.",
  },
  idle: { label: "BGP Idle", description: "Phiên BGP chưa thiết lập (Idle)." },
  connect: { label: "BGP Connect", description: "Phiên BGP đang cố kết nối, chưa Established." },

  // OSPF neighbor state
  full: {
    label: "OSPF đã đồng bộ",
    description: "Neighbor OSPF ở trạng thái full — đã đồng bộ đầy đủ.",
  },
  init: { label: "OSPF Init", description: "Neighbor OSPF mới ở bước khởi tạo, chưa full." },

  // Shared status (BGP summary + HW alarm overall)
  critical: {
    label: "Nghiêm trọng",
    description: "Có cảnh báo/lỗi nghiêm trọng cần xử lý ngay.",
    action: "Kiểm tra ngay.",
  },
  ok: { label: "Bình thường", description: "Trạng thái bình thường, không có cảnh báo." },
  warning: { label: "Cảnh báo", description: "Có cảnh báo cần xem xét." },
  error: { label: "Lỗi", description: "Có lỗi nghiêm trọng." },

  // Alarm severity (HW alarm detail) — generic, shared across vendors
  major: {
    label: "Cảnh báo nặng",
    description: "Cảnh báo mức nặng (Major) — ảnh hưởng đáng kể, cần xử lý sớm.",
    action: "Xử lý sớm.",
  },
  minor: {
    label: "Cảnh báo nhẹ",
    description: "Cảnh báo mức nhẹ (Minor) — theo dõi, chưa khẩn cấp.",
  },

  // Import batch / finding status
  completed: { label: "Hoàn tất", description: "Batch import đã hoàn tất thành công." },
  running: { label: "Đang chạy", description: "Batch import đang được xử lý." },
  new: { label: "Mới", description: "Phát hiện mới, chưa được xử lý." },
  acknowledged: { label: "Đã ghi nhận", description: "Phát hiện đã được người vận hành ghi nhận." },
};

/** Badge lookup that also resolves reclaim confidence (High/Medium/Low) which
 * shares the StatusBadge component with state values. */
export function badgeInfo(value: string): TermInfo | undefined {
  const key = value.toLowerCase();
  if (STATUS_INFO[key]) return STATUS_INFO[key];
  if (key === "high") return CONFIDENCE_INFO.High;
  if (key === "medium") return CONFIDENCE_INFO.Medium;
  if (key === "low") return CONFIDENCE_INFO.Low;
  return undefined;
}

// ---------------------------------------------------------------------------
// Audit rules
// ---------------------------------------------------------------------------

export interface RuleInfo {
  /** Short Vietnamese name. */
  label: string;
  /** Severity shown in the glossary (some rules are conditional). */
  severity: string;
  /** Which page/group the rule belongs to. */
  category: string;
  description: string;
  action?: string;
}

export const RULE_INFO: Record<string, RuleInfo> = {
  IP_DUP_ACTIVE_ACTIVE: {
    label: "IP trùng — nhiều interface Active",
    severity: "Critical",
    category: "IP Duplicate",
    description: "Cùng một IP đang Active trên từ 2 interface trở lên → nguy cơ xung đột địa chỉ trực tiếp.",
    action: "Kiểm tra và gỡ trùng ngay. Trùng khác VRF được hạ một bậc mức độ.",
  },
  IP_DUP_ACTIVE_MIXED: {
    label: "IP trùng — 1 Active + còn lại không",
    severity: "High",
    category: "IP Duplicate",
    description: "Một interface Active và các interface khác (không Active) cùng dùng một IP.",
    action: "Xác minh interface nào đúng, dọn khai báo còn lại.",
  },
  IP_DUP_INACTIVE: {
    label: "IP trùng — đều không Active",
    severity: "Medium",
    category: "IP Duplicate",
    description: "Cùng một IP xuất hiện trên nhiều interface nhưng không cái nào đang Active.",
    action: "Dọn các khai báo thừa.",
  },
  NETWORK_OVERUSED: {
    label: "Network vượt số IP kỳ vọng",
    severity: "High / Medium",
    category: "Network",
    description: "Số endpoint trong một subnet vượt mức (ví dụ /30 hoặc /31 không nên quá 2 IP, /32 không quá 1).",
    action: "Rà soát lại việc phân bổ IP trong subnet.",
  },
  GATEWAY_OUTSIDE_SUBNET: {
    label: "Gateway ngoài subnet",
    severity: "High",
    category: "Gateway",
    description: "Gateway khai báo không nằm trong network của IP/interface.",
    action: "Sửa lại gateway hoặc prefix.",
  },
  STATUS_STATE_MISMATCH: {
    label: "Mâu thuẫn trạng thái",
    severity: "Medium",
    category: "Status",
    description: "Status không khớp admin/oper state (ví dụ Active nhưng oper Down, hoặc Admin-Down nhưng admin không Down).",
    action: "Đồng bộ lại khai báo với trạng thái thực tế.",
  },
  PREFIX_SERVICE_MISMATCH: {
    label: "Prefix lệch loại dịch vụ",
    severity: "Low",
    category: "Prefix",
    description: "Prefix không hợp với loại dịch vụ (ví dụ Loopback nên là /32, Uplink nên là /30 hoặc /31).",
    action: "Kiểm tra lại prefix khai báo.",
  },
  BGP_PEER_NOT_ESTABLISHED: {
    label: "BGP peer chưa Established",
    severity: "High",
    category: "BGP",
    description: "Phiên BGP với neighbor không ở trạng thái Established.",
    action: "Kiểm tra kết nối/cấu hình của peer.",
  },
  BGP_DEVICE_WARNING_ERROR: {
    label: "BGP thiết bị WARNING/ERROR",
    severity: "High / Medium",
    category: "BGP",
    description: "Trạng thái tổng hợp BGP của thiết bị là WARNING (Medium) hoặc ERROR (High).",
    action: "Mở chi tiết thiết bị để xem peer nào bất thường.",
  },
  BGP_HIGH_FLAPS: {
    label: "BGP flap nhiều",
    severity: "High / Medium",
    category: "BGP",
    description: "Số lần flap cao (≥100.000 → High, ≥1.000 → Medium) → phiên BGP không ổn định.",
    action: "Kiểm tra chất lượng đường truyền và peer.",
  },
  BGP_LOW_ACTIVE_RATIO: {
    label: "BGP nhận route nhưng 0 active",
    severity: "Medium",
    category: "BGP",
    description: "Peer nhận được VPNv4 route nhưng số route active = 0 — có thể lỗi import/policy.",
    action: "Kiểm tra route policy / VRF import.",
  },
  OSPF_NEIGHBOR_NOT_FULL: {
    label: "OSPF neighbor chưa full",
    severity: "High",
    category: "OSPF",
    description: "Neighbor OSPF không ở trạng thái full (chưa đồng bộ đầy đủ).",
    action: "Kiểm tra adjacency OSPF giữa hai thiết bị.",
  },
  OSPF_NEIGHBOR_DISAPPEARED: {
    label: "OSPF neighbor biến mất",
    severity: "High",
    category: "OSPF",
    description: "Neighbor OSPF tồn tại ở batch trước nhưng hoàn toàn biến mất trong batch mới — có thể mất kết nối hoặc mất dữ liệu thu thập.",
    action: "Kiểm tra kết nối OSPF giữa hai thiết bị; đối chiếu với dữ liệu thu thập gốc.",
  },
  OSPF_COLLECTION_ERROR: {
    label: "Lỗi thu thập OSPF",
    severity: "Medium",
    category: "OSPF",
    description: "Không lấy được dữ liệu OSPF từ thiết bị (OSPF có thể bị tắt hoặc không truy cập được MIB).",
    action: "Kiểm tra OSPF/MIB/kết nối tới thiết bị.",
  },
};

import type ExcelJS from "exceljs";

// ExcelJS is loaded lazily (~1 MB) — only fetched when the user actually
// clicks an export button, keeping the main bundle lean.
let _exceljs: typeof import("exceljs") | null = null;
async function getExcelJS(): Promise<typeof import("exceljs")> {
  if (!_exceljs) _exceljs = await import("exceljs");
  return _exceljs;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExcelColumn {
  header: string;
  key: string;
  width: number;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const NAVY = "FF1B3A5C";
const WHITE = "FFFFFFFF";
const TITLE_BG = "FFE8EDF3";
const STRIPE = "FFF1F5F9";
const TEXT = "FF1E293B";
const BORDER_DATA = "FFE2E8F0";

const FONT_FAMILY = "Calibri";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayFormatted(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function isNumeric(v: unknown): boolean {
  return typeof v === "number" && !Number.isNaN(v);
}

const TITLE_FONT: Partial<ExcelJS.Font> = { name: FONT_FAMILY, size: 13, bold: true, color: { argb: NAVY } };
const HEADER_FONT: Partial<ExcelJS.Font> = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: WHITE } };
const DATA_FONT: Partial<ExcelJS.Font> = { name: FONT_FAMILY, size: 10, color: { argb: TEXT } };

const HEADER_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const TITLE_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
const STRIPE_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
const WHITE_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };

const HEADER_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: WHITE } },
  bottom: { style: "thin", color: { argb: WHITE } },
  left: { style: "thin", color: { argb: WHITE } },
  right: { style: "thin", color: { argb: WHITE } },
};

const DATA_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_DATA } },
  bottom: { style: "thin", color: { argb: BORDER_DATA } },
  left: { style: "thin", color: { argb: BORDER_DATA } },
  right: { style: "thin", color: { argb: BORDER_DATA } },
};

const TITLE_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: NAVY } },
};

function buildSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: ExcelColumn[],
  rows: object[],
  reportTitle: string,
) {
  const ws = workbook.addWorksheet(sheetName.slice(0, 31));
  const colCount = columns.length;

  // --- Row 1: title ---
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${reportTitle} — Xuất ngày ${todayFormatted()}`;
  titleCell.font = TITLE_FONT;
  titleCell.fill = TITLE_FILL;
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  titleCell.border = TITLE_BORDER;
  ws.getRow(1).height = 36;

  // --- Row 2: headers ---
  const headerRow = ws.getRow(2);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = HEADER_BORDER;
  });
  headerRow.height = 30;

  // Column widths
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  // --- Row 3+: data ---
  rows.forEach((row, rowIdx) => {
    const excelRow = ws.getRow(rowIdx + 3);
    const isOdd = rowIdx % 2 === 1;
    const rec = row as Record<string, unknown>;

    columns.forEach((col, colIdx) => {
      const raw = rec[col.key];
      const value = raw === null || raw === undefined
        ? ""
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : raw;

      const cell = excelRow.getCell(colIdx + 1);
      cell.value = value as ExcelJS.CellValue;
      cell.font = DATA_FONT;
      cell.fill = isOdd ? STRIPE_FILL : WHITE_FILL;
      cell.border = DATA_BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal: isNumeric(value) ? "right" : "left",
        wrapText: true,
      };
    });

    excelRow.height = 22;
  });

  // Auto-filter on header row
  if (colCount > 0) {
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2 + rows.length, column: colCount },
    };
  }

  // Freeze panes: title + header always visible
  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 0 }];
}

async function createWorkbook(): Promise<ExcelJS.Workbook> {
  const mod = await getExcelJS();
  const wb = new mod.Workbook();
  wb.creator = "Transmission Hub";
  wb.company = "MobiFone";
  wb.created = new Date();
  return wb;
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportToExcel(
  filename: string,
  sheetName: string,
  columns: ExcelColumn[],
  rows: object[],
  reportTitle?: string,
): Promise<void> {
  const wb = await createWorkbook();
  buildSheet(wb, sheetName, columns, rows, reportTitle ?? sheetName);
  await downloadWorkbook(wb, filename);
}

export interface SheetDef {
  name: string;
  columns: ExcelColumn[];
  rows: object[];
  title?: string;
}

export async function exportSheets(filename: string, sheets: SheetDef[]): Promise<void> {
  const wb = await createWorkbook();
  let added = 0;
  for (const s of sheets) {
    if (s.rows.length === 0) continue;
    buildSheet(wb, s.name, s.columns, s.rows, s.title ?? s.name);
    added++;
  }
  if (added === 0) return;
  await downloadWorkbook(wb, filename);
}

/** Enriched views expose `is_new` as a boolean delta flag (true = the row
 * appeared in the latest batch but not the previous one). Excel exports show it
 * as a readable Vietnamese label instead of a bare TRUE/FALSE. */
export function withDeltaLabel<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, is_new: r.is_new ? "Mới" : "Không đổi" }));
}

// ---------------------------------------------------------------------------
// Column presets — reusable across pages
// ---------------------------------------------------------------------------

export const AUDIT_COLUMNS: ExcelColumn[] = [
  { header: "Δ", key: "is_new", width: 12 },
  { header: "Mức độ", key: "severity", width: 12 },
  { header: "Nhóm", key: "category", width: 20 },
  { header: "Rule", key: "rule_code", width: 18 },
  { header: "Tiêu đề", key: "title", width: 42 },
  { header: "Chi tiết", key: "detail", width: 55 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "IP", key: "ip_address", width: 18 },
  { header: "Network", key: "network", width: 20 },
  { header: "Interface", key: "interface_name", width: 28 },
  { header: "Dịch vụ", key: "service_type", width: 16 },
  { header: "VRF", key: "vrf_instance", width: 16 },
  { header: "Trạng thái IF", key: "intf_status", width: 15 },
  { header: "Xử lý", key: "status", width: 14 },
  { header: "Độ tin cậy", key: "confidence", width: 12 },
  { header: "Ưu tiên", key: "priority_score", width: 10 },
];

export const RECLAIM_COLUMNS: ExcelColumn[] = [
  { header: "Δ", key: "is_new", width: 12 },
  { header: "Độ tin cậy", key: "confidence", width: 12 },
  { header: "Loại", key: "candidate_type", width: 20 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "IP", key: "ip_address", width: 18 },
  { header: "Network", key: "network", width: 20 },
  { header: "Interface", key: "interface_name", width: 28 },
  { header: "Dịch vụ", key: "service_type", width: 16 },
  { header: "Trạng thái", key: "current_status", width: 15 },
  { header: "Điểm", key: "score", width: 10 },
  { header: "Ưu tiên", key: "priority_score", width: 10 },
  { header: "Lý do", key: "reason", width: 55 },
];

export const ROUTING_FINDING_COLUMNS: ExcelColumn[] = [
  { header: "Δ", key: "is_new", width: 12 },
  { header: "Mức độ", key: "severity", width: 12 },
  { header: "Nhóm", key: "category", width: 20 },
  { header: "Rule", key: "rule_code", width: 18 },
  { header: "Tiêu đề", key: "title", width: 42 },
  { header: "Chi tiết", key: "detail", width: 55 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "IP", key: "ip_address", width: 18 },
  { header: "Độ tin cậy", key: "confidence", width: 12 },
  { header: "Ưu tiên", key: "priority_score", width: 10 },
];

export const INVENTORY_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Interface", key: "interface_name", width: 28 },
  { header: "VLAN", key: "vlan_id", width: 10 },
  { header: "Mô tả VLAN", key: "vlan_description", width: 30 },
  { header: "VRF", key: "vrf_instance", width: 16 },
  { header: "IP", key: "ip_address", width: 18 },
  { header: "Prefix", key: "prefix_length", width: 10 },
  { header: "Network", key: "network", width: 20 },
  { header: "Gateway", key: "gateway", width: 18 },
  { header: "Cổng vật lý", key: "physical_port", width: 22 },
  { header: "Mô tả cổng", key: "port_description", width: 30 },
  { header: "Dịch vụ", key: "service_type", width: 16 },
  { header: "Định tuyến tĩnh", key: "static_routes", width: 40 },
  { header: "Trạng thái", key: "status", width: 14 },
];

export const BGP_SUMMARY_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Router ID", key: "router_id", width: 18 },
  { header: "Local AS", key: "local_as", width: 12 },
  { header: "Trạng thái", key: "status", width: 14 },
  { header: "Tổng peer", key: "total_peers", width: 12 },
  { header: "Established", key: "established", width: 14 },
  { header: "Not Established", key: "not_established", width: 16 },
  { header: "VPNv4 Active", key: "vpnv4_active", width: 14 },
  { header: "VPNv4 Rcvd", key: "vpnv4_rcvd", width: 14 },
];

export const BGP_NEIGHBOR_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Neighbor IP", key: "neighbor_ip", width: 18 },
  { header: "Thiết bị neighbor", key: "neighbor_device_name", width: 22 },
  { header: "Remote AS", key: "remote_as", width: 12 },
  { header: "Mô tả", key: "description", width: 30 },
  { header: "Trạng thái", key: "bgp_state", width: 16 },
  { header: "Up/Down", key: "up_down", width: 16 },
  { header: "Flaps", key: "flaps", width: 10 },
  { header: "VPNv4 Active", key: "vpnv4_active", width: 14 },
  { header: "VPNv4 Rcvd", key: "vpnv4_rcvd", width: 14 },
  { header: "Lỗi gần nhất", key: "last_error", width: 30 },
];

export const ROUTING_BGP_NEIGHBOR_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Neighbor IP", key: "neighbor_ip", width: 18 },
  { header: "Thiết bị neighbor", key: "neighbor_device_name", width: 22 },
  { header: "Remote AS", key: "remote_as", width: 12 },
  { header: "Mô tả", key: "description", width: 30 },
  { header: "Trạng thái", key: "bgp_state", width: 16 },
  { header: "Trạng thái (kỳ trước)", key: "prev_bgp_state", width: 20 },
  { header: "Up/Down", key: "up_down", width: 16 },
  { header: "Flaps", key: "flaps", width: 10 },
  { header: "Flap Δ", key: "flap_delta", width: 10 },
  { header: "VPNv4 Active", key: "vpnv4_active", width: 14 },
  { header: "VPNv4 Rcvd", key: "vpnv4_rcvd", width: 14 },
  { header: "Lỗi gần nhất", key: "last_error", width: 30 },
];

export const ROUTING_OSPF_NEIGHBOR_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Router ID", key: "router_id", width: 18 },
  { header: "Neighbor IP", key: "neighbor_ip", width: 18 },
  { header: "Neighbor Router ID", key: "neighbor_router_id", width: 20 },
  { header: "Thiết bị neighbor", key: "neighbor_device_name", width: 22 },
  { header: "Trạng thái", key: "neighbor_state", width: 16 },
  { header: "Trạng thái (kỳ trước)", key: "prev_neighbor_state", width: 20 },
];

export const OSPF_INTERFACE_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Router ID", key: "router_id", width: 18 },
  { header: "Interface", key: "if_name", width: 28 },
  { header: "IF IP", key: "if_ip", width: 18 },
  { header: "Area", key: "area", width: 14 },
  { header: "Trạng thái", key: "if_state", width: 14 },
  { header: "Cost", key: "cost", width: 10 },
  { header: "MTU", key: "mtu", width: 10 },
];

export const OSPF_NEIGHBOR_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Router ID", key: "router_id", width: 18 },
  { header: "Neighbor IP", key: "neighbor_ip", width: 18 },
  { header: "Neighbor Router ID", key: "neighbor_router_id", width: 20 },
  { header: "Thiết bị neighbor", key: "neighbor_device_name", width: 22 },
  { header: "Trạng thái", key: "neighbor_state", width: 16 },
];

export const SEARCH_FINDING_COLUMNS: ExcelColumn[] = [
  { header: "Mức độ", key: "severity", width: 12 },
  { header: "Nhóm", key: "category", width: 20 },
  { header: "Rule", key: "rule_code", width: 18 },
  { header: "Tiêu đề", key: "title", width: 42 },
  { header: "Chi tiết", key: "detail", width: 55 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "IP", key: "ip_address", width: 18 },
  { header: "Xử lý", key: "status", width: 14 },
  { header: "Độ tin cậy", key: "confidence", width: 12 },
  { header: "Ưu tiên", key: "priority_score", width: 10 },
];

export const HW_ALARM_SUMMARY_COLUMNS: ExcelColumn[] = [
  { header: "Δ", key: "is_new", width: 12 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Vendor", key: "vendor", width: 14 },
  { header: "Tổng thể", key: "overall_status", width: 14 },
  { header: "Tổng thể (kỳ trước)", key: "prev_overall_status", width: 20 },
  { header: "Critical", key: "critical", width: 10 },
  { header: "Critical (kỳ trước)", key: "prev_critical", width: 18 },
  { header: "Major", key: "major", width: 10 },
  { header: "Major (kỳ trước)", key: "prev_major", width: 18 },
  { header: "Minor", key: "minor", width: 10 },
  { header: "Power", key: "power_status", width: 22 },
  { header: "Fan", key: "fan_status", width: 22 },
  { header: "Nhiệt độ max", key: "max_temp", width: 14 },
  { header: "Ngưỡng nhiệt", key: "temp_threshold", width: 18 },
];

export const HW_ALARM_DETAIL_COLUMNS: ExcelColumn[] = [
  { header: "Δ", key: "is_new", width: 12 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Vendor", key: "vendor", width: 14 },
  { header: "Nhóm", key: "category", width: 18 },
  { header: "Mức độ", key: "severity", width: 12 },
  { header: "Thành phần", key: "component", width: 28 },
  { header: "Trạng thái", key: "status", width: 16 },
  { header: "Trạng thái (kỳ trước)", key: "prev_status", width: 20 },
  { header: "Chi tiết", key: "detail", width: 55 },
];

export const SEARCH_HW_ALARM_SUMMARY_COLUMNS: ExcelColumn[] = [
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "Device IP", key: "device_ip", width: 18 },
  { header: "Vendor", key: "vendor", width: 14 },
  { header: "Tổng thể", key: "overall_status", width: 14 },
  { header: "Critical", key: "critical", width: 10 },
  { header: "Major", key: "major", width: 10 },
  { header: "Minor", key: "minor", width: 10 },
  { header: "Power", key: "power_status", width: 22 },
  { header: "Fan", key: "fan_status", width: 22 },
  { header: "Nhiệt độ max", key: "max_temp", width: 14 },
  { header: "Ngưỡng nhiệt", key: "temp_threshold", width: 18 },
];

export const SEARCH_RECLAIM_COLUMNS: ExcelColumn[] = [
  { header: "Độ tin cậy", key: "confidence", width: 12 },
  { header: "Loại", key: "candidate_type", width: 20 },
  { header: "Thiết bị", key: "device_name", width: 22 },
  { header: "IP", key: "ip_address", width: 18 },
  { header: "Network", key: "network", width: 20 },
  { header: "Interface", key: "interface_name", width: 28 },
  { header: "Dịch vụ", key: "service_type", width: 16 },
  { header: "Trạng thái", key: "current_status", width: 15 },
  { header: "Điểm", key: "score", width: 10 },
  { header: "Ưu tiên", key: "priority_score", width: 10 },
  { header: "Lý do", key: "reason", width: 55 },
];

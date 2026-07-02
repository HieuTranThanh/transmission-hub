# Transmission Hub — Hướng dẫn phát triển

## Tech stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite 8
- **Backend**: Supabase (PostgreSQL + PostgREST)
- **Import script (prod)**: Python — `import_data.py` (weekly, Supabase + Storage)
- **Import script (samples)**: Node.js (tsx) — `scripts/import-samples.ts`
- **Test framework**: Vitest 4 + @testing-library/react + jsdom

## Lệnh thường dùng

```bash
npm run dev          # Chạy dev server (port 5174)
npm run build        # Type-check + production build (tsc -b && vite build)
npm run lint         # Type-check only (tsc -b --noEmit)
npm run test         # Chạy toàn bộ test suite (vitest run)
npm run test:watch   # Chạy test ở chế độ watch (vitest)
npm run import:samples  # Import dữ liệu mẫu vào Supabase
```

## Quy trình kiểm thử khi sửa code

**QUAN TRỌNG**: Sau mỗi lần sửa code, PHẢI chạy đủ 3 bước theo thứ tự:

```bash
npm run lint         # Bước 1: Type-check — không được có lỗi TypeScript
npm run test         # Bước 2: Test — tất cả 80 test phải PASS
npm run build        # Bước 3: Build — production build phải thành công
```

Hoặc chạy gộp:

```bash
npm run lint && npm run test && npm run build
```

## Cấu trúc test

```
src/lib/ip.test.ts                  — IPv4/CIDR validation, subnet matching, normalization
src/lib/format.test.ts              — formatDateTime, formatNumber, valueOrDash, batchDelta
src/lib/search-utils.test.ts        — ilikePattern, orFilterValue (SQL safety)
src/lib/cascading-filters.test.ts   — cascadingOptions (Excel-style linked filter)
src/lib/query-cache.test.ts         — cached(), invalidateCache(), request dedup
src/lib/glossary.test.ts            — SEVERITY_INFO, CONFIDENCE_INFO, STATUS_INFO, RULE_INFO, badgeInfo
src/components/DataTable.test.ts    — nextSortState, compareValues (sorting logic)
scripts/lib/audit-rules.test.ts     — Rule engine: IP_DUP, GATEWAY, STATUS, PREFIX, NETWORK, BGP, OSPF
scripts/lib/reclaim-rules.test.ts   — Reclaim scoring: eligibility, penalties, confidence, dup IP safety
```

### Vitest config

Cấu hình test nằm trong `vite.config.ts` (field `test`):
- `globals: true` — không cần import describe/it/expect
- `environment: "jsdom"` — DOM giả lập cho React component test
- `setupFiles: ["./src/test-setup.ts"]` — load jest-dom matchers
- `include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"]`

## Quy tắc khi viết test mới

1. Đặt file test cùng thư mục với file source, hậu tố `.test.ts` hoặc `.test.tsx`
2. Test logic thuần (pure functions) trước — không cần mock
3. Test component React dùng `@testing-library/react` + `jsdom`
4. **Ưu tiên sửa code thay vì sửa test** — test phản ánh hành vi đúng
5. Không mock database trong test — chỉ test logic thuần (rule engine, helpers, formatters)

## Quy tắc quan trọng

- **Supabase row cap**: Supabase hard-cap tại 1000 rows — dùng `fetchAllRows` để phân trang
- **SQL migration**: KHÔNG dùng `DROP VIEW` — luôn dùng `CREATE OR REPLACE VIEW`
- **npm audit**: KHÔNG chạy `npm audit fix --force` — sẽ break tính năng export Excel
- **UI language**: Text hiển thị bằng tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh
- **Table sort**: Mọi bảng dữ liệu UI phải hỗ trợ sort A-Z/Z-A qua header (trừ Topology)
- **Cascading filters**: Trang có ≥2 filter phải cascade; chú ý NULL gotcha với isAllSelected
- **Filter ready gate**: Trang filter phải gate fetch bằng `filtersReady` để `[]` không bị gửi trước khi options load
- **Display ordering**: Thứ tự hiển thị nội dung phải đồng nhất ở Sidebar, Dashboard, SearchPage, Glossary: Cảnh báo phần cứng → Phát hiện kiểm tra → BGP/OSPF → Thu hồi tài nguyên
- **Glossary tabs**: Trang Chú giải dùng tabs (không scroll dài); mỗi tab tương ứng 1 feature + tab "Chung"
- **StatusBadge tooltips**: `STATUS_INFO` entries trong `glossary.ts` phải generic (dùng chung cho nhiều feature). `badgeInfo()` là nguồn duy nhất cho tooltip hover
